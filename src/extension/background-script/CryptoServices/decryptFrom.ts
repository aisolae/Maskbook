import * as Alpha40 from '../../../crypto/crypto-alpha-40'
import * as Alpha39 from '../../../crypto/crypto-alpha-39'
import * as Gun1 from '../../../network/gun/version.1'
import * as Gun2 from '../../../network/gun/version.2'
import { decodeText } from '../../../utils/type-transform/String-ArrayBuffer'
import { deconstructPayload, Payload } from '../../../utils/type-transform/Payload'
import { geti18nString } from '../../../utils/i18n'
import { getMyPrivateKey } from '../../../database'
import { queryLocalKeyDB, queryPersonDB, PersonRecord, PersonRecordPublicPrivate } from '../../../database/people'
import { PersonIdentifier, PostIVIdentifier } from '../../../database/type'
import { queryPostDB, updatePostDB } from '../../../database/post'
import { addPerson } from './addPerson'
import { MessageCenter } from '../../../utils/messages'
import { getNetworkWorker } from '../../../social-network/worker'
import { getSignablePayload, cryptoProviderTable } from './utils'

type Progress = {
    progress: 'finding_person_public_key' | 'finding_post_key'
}
type DebugInfo = {
    debug: 'debug_finding_hash'
    hash: [string, string]
}
type Success = {
    signatureVerifyResult: boolean
    content: string
    through: ('author_key_not_found' | 'post_key_cached' | 'normal_decrypted')[]
}
type Failure = {
    error: string
}
export type SuccessDecryption = Success
export type FailureDecryption = Failure
export type DecryptionProgress = Progress
type ReturnOfDecryptFromMessageWithProgress = AsyncGenerator<
    Failure | Progress | DebugInfo,
    Success | Failure,
    void
> & {
    [Symbol.asyncIterator](): AsyncIterator<Failure | Progress | DebugInfo, Success | Failure, void>
}

/**
 * Decrypt message from a user
 * @param encrypted post
 * @param author Post by
 * @param whoAmI My username
 *
 * @description
 * The decrypt process:
 *
 * ## Prepare
 * a. if unknown payload, throw
 * b. if unknown payload version, throw
 *
 * ## Decrypt for version -38, -39 and -40
 * a. read the cache `cachedPostResult`
 * b. find author's public key (See: `findAuthorPublicKey` function)
 *      0. if there is cache, return the cache
 *      1. if try N times but not finding the key, throw
 * c. if there is cache, return the cache
 * d. try to decrypt by `author` with `decryptAsAuthor`
 * e. try to decrypt by `whoAmI` with `decryptAsAuthor`
 * f. if `author` === `whoAmI`, throw
 * g. find key for `whoAmI` on Gun
 * h. try to decrypt by the key on Gun
 * i. return a Promise
 *      0. if version === -40, throws
 *      1. listen to future new keys on Gun
 *      2. try to decrypt with that key
 */
export async function* decryptFromMessageWithProgress(
    encrypted: string,
    author: PersonIdentifier,
    whoAmI: PersonIdentifier,
): ReturnOfDecryptFromMessageWithProgress {
    // If any of parameters is changed, we will not handle it.
    let _data: Payload
    try {
        const decoder = getNetworkWorker(author.network).payloadDecoder
        _data = deconstructPayload(encrypted, decoder, true)
    } catch (e) {
        return { error: e.message }
    }
    const data = _data
    const { version } = data

    if (version === -40 || version === -39 || version === -38) {
        const { encryptedText, iv, signature, version } = data
        const ownersAESKeyEncrypted = data.version === -38 ? data.AESKeyEncrypted : data.ownersAESKeyEncrypted
        const waitForVerifySignaturePayload = getSignablePayload(data)
        const cryptoProvider = cryptoProviderTable[version]

        // ? First, read the cache.
        const [cachedPostResult, setPostCache] = await decryptFromCache(data, author)

        // ? Find author's public key.
        let byPerson!: PersonRecordWithPublicKey
        for await (const _ of iteratorHelper(findAuthorPublicKey(author, !!cachedPostResult))) {
            if (_.done) {
                if (_.value === 'out of chance')
                    return { error: geti18nString('service_others_key_not_found', author.userId) }
                else if (_.value === 'use cache')
                    return {
                        signatureVerifyResult: false,
                        content: cachedPostResult!,
                        through: ['author_key_not_found', 'post_key_cached'],
                    } as Success
                else byPerson = _.value
            }
        }

        // ? Get my public & private key.
        const mine = await getMyPrivateKey(whoAmI)
        if (cachedPostResult) {
            if (!author.equals(whoAmI) && mine && mine.publicKey && version !== -40) {
                const { keyHash, postHash } = await Gun2.queryPostKeysOnGun2(
                    version,
                    iv,
                    mine.publicKey,
                    getNetworkWorker(whoAmI).gunNetworkHint,
                )
                yield { debug: 'debug_finding_hash', hash: [postHash, keyHash] }
            }
            return {
                signatureVerifyResult: byPerson.publicKey
                    ? await cryptoProvider.verify(waitForVerifySignaturePayload, signature || '', byPerson.publicKey)
                    : false,
                content: cachedPostResult,
                through: ['post_key_cached'],
            } as Success
        }

        let lastError: any
        /**
         * ? try to decrypt as I am the author
         * ? then try to decrypt as whoAmI
         * ? then try to go through a normal decrypt process
         */
        try {
            // ? try to decrypt the post as I am the author
            const authorsPrivate = await getMyPrivateKey(author)
            // ! Don't remove the await
            if (authorsPrivate) return await decryptAsAuthor(authorsPrivate)
        } catch (e) {
            lastError = e
        }

        try {
            // ? try to decrypt the post as the whoAmI hint
            // ! Don't remove the await
            if (mine) return await decryptAsAuthor(mine)
        } catch (e) {
            lastError = e
        }

        if (author.equals(whoAmI)) {
            // if the decryption process goes here,
            // that means it is failed to decrypt by local identities.
            // By removing this if block, Maskbook will search the key
            // for the post even that post by myself.
            if (lastError instanceof DOMException) return handleDOMException(lastError)
            return { error: geti18nString('service_self_key_decryption_failed') } as Failure
        }
        // The following process need a ECDH key to do.
        // So if the account have not setup yet, fail here.
        if (!mine) return { error: geti18nString('service_not_setup_yet') }

        yield { progress: 'finding_post_key' }
        const aesKeyEncrypted: Array<Alpha40.PublishedAESKey | Gun2.SharedAESKeyGun2> = []
        if (version === -40) {
            // Deprecated payload
            // eslint-disable-next-line import/no-deprecated
            const result = await Gun1.queryPostAESKey(iv, whoAmI.userId)
            if (result === undefined) return { error: geti18nString('service_not_share_target') }
            aesKeyEncrypted.push(result)
        } else if (version === -39 || version === -38) {
            const { keyHash, keys, postHash } = await Gun2.queryPostKeysOnGun2(
                version,
                iv,
                mine.publicKey,
                getNetworkWorker(author).gunNetworkHint,
            )
            yield { debug: 'debug_finding_hash', hash: [postHash, keyHash] }
            aesKeyEncrypted.push(...keys)
        }
        // If we can decrypt with current info, just do it.
        try {
            // ! Do not remove the await here.
            return await decryptWith(aesKeyEncrypted)
        } catch (e) {
            if (e.message === geti18nString('service_not_share_target')) {
                console.debug(e)
                // TODO: Replace this error with:
                // You do not have the necessary private key to decrypt this message.
                // What to do next: You can ask your friend to visit your profile page, so that their Maskbook extension will detect and add you to recipients.
                // ? after the auto-share with friends is done.
                yield { error: geti18nString('service_not_share_target') } as Failure
            } else {
                return handleDOMException(e)
            }
        }

        // Failed, we have to wait for the future info from gun.
        return new Promise<Success>((resolve, reject) => {
            if (version === -40) return reject()
            const undo = Gun2.subscribePostKeysOnGun2(
                version,
                iv,
                mine.publicKey,
                getNetworkWorker(author).gunNetworkHint,
                async key => {
                    console.log('New key received, trying', key)
                    try {
                        const result = await decryptWith(key)
                        undo()
                        resolve(result)
                    } catch (e) {
                        console.debug(e)
                    }
                },
            )
        })

        async function decryptWith(
            key:
                | Alpha39.PublishedAESKey
                | Alpha40.PublishedAESKey
                | Array<Alpha39.PublishedAESKey | Alpha40.PublishedAESKey>,
        ): Promise<Success> {
            const [contentArrayBuffer, postAESKey] = await cryptoProvider.decryptMessage1ToNByOther({
                version,
                AESKeyEncrypted: key,
                authorsPublicKeyECDH: byPerson!.publicKey!,
                encryptedContent: encryptedText,
                privateKeyECDH: mine!.privateKey,
                iv,
            })

            // Store the key to speed up next time decrypt
            setPostCache(postAESKey)
            const content = decodeText(contentArrayBuffer)
            try {
                if (!signature) throw new TypeError('No signature')
                const signatureVerifyResult = await cryptoProvider.verify(
                    waitForVerifySignaturePayload,
                    signature,
                    byPerson!.publicKey!,
                )
                return { signatureVerifyResult, content, through: ['normal_decrypted'] }
            } catch {
                return { signatureVerifyResult: false, content, through: ['normal_decrypted'] }
            }
        }

        async function decryptAsAuthor(author: PersonRecordPublicPrivate) {
            const [contentArrayBuffer, postAESKey] = await cryptoProvider.decryptMessage1ToNByMyself({
                version,
                encryptedAESKey: ownersAESKeyEncrypted,
                encryptedContent: encryptedText,
                myLocalKey: (await queryLocalKeyDB(author.identifier))!,
                iv,
            })
            // Store the key to speed up next time decrypt
            setPostCache(postAESKey)
            const content = decodeText(contentArrayBuffer)
            const signatureVerifyResult = await cryptoProvider.verify(
                waitForVerifySignaturePayload,
                signature || '',
                author.publicKey,
            )
            return { signatureVerifyResult, content, through: ['normal_decrypted'] } as Success
        }
    }
    return { error: geti18nString('service_unknown_payload') }
}
function handleDOMException(e: unknown) {
    if (e instanceof DOMException) {
        console.error(e)
        return { error: geti18nString('service_decryption_failed') } as Failure
    } else throw e
}
type PersonRecordWithPublicKey = PersonRecord & Required<Pick<PersonRecord, 'publicKey'>>
async function* findAuthorPublicKey(
    by: PersonIdentifier,
    hasCache: boolean,
    maxIteration = 10,
): AsyncGenerator<Progress, 'out of chance' | 'use cache' | PersonRecordWithPublicKey, unknown> {
    let author = await queryPersonDB(by)
    let iterations = 0
    while (author === null || !author.publicKey) {
        iterations += 1
        if (iterations < maxIteration) yield { progress: 'finding_person_public_key' } as Progress
        else return 'out of chance' as const

        author = await addPerson(by).catch(() => null)

        if (!author || !author.publicKey) {
            if (hasCache) return 'use cache' as const
            let rejectGun = () => {}
            let rejectDatabase = () => {}
            const gunPromise = new Promise((resolve, reject) => {
                rejectGun = () => {
                    undo()
                    reject()
                }
                const undo = Gun2.subscribePersonFromGun2(by, data => {
                    if (data && (data.provePostId || '').length > 0) {
                        undo()
                        resolve()
                    }
                })
            })
            const databasePromise = new Promise((resolve, reject) => {
                const undo = MessageCenter.on('peopleChanged', data => {
                    data.filter(x => x.reason !== 'delete').forEach(x => {
                        if (x.of.identifier.equals(by)) {
                            undo()
                            resolve()
                        }
                    })
                })
                rejectDatabase = () => {
                    undo()
                    reject()
                }
            })
            await Promise.race([gunPromise, databasePromise])
                .then(() => {
                    rejectDatabase()
                    rejectGun()
                })
                .catch(() => null)
        }
    }
    if (author && author.publicKey) return author as PersonRecordWithPublicKey
    return 'out of chance'
}

export async function decryptFrom(
    ...args: Parameters<typeof decryptFromMessageWithProgress>
): Promise<Success | Failure> {
    for await (const _ of iteratorHelper(decryptFromMessageWithProgress(...args))) {
        if (_.done) return _.value
    }
    throw new TypeError('Invalid iterator state')
}

async function decryptFromCache(postPayload: Payload, by: PersonIdentifier) {
    const { encryptedText, iv, version } = postPayload
    const cryptoProvider = version === -40 ? Alpha40 : Alpha39

    const postIdentifier = new PostIVIdentifier(by.network, iv)
    const cachedKey = await queryPostDB(postIdentifier)
    const setCache = (postAESKey: CryptoKey) => {
        updatePostDB(
            {
                identifier: postIdentifier,
                postCryptoKey: postAESKey,
                postBy: by,
            },
            'append',
        )
    }
    if (cachedKey && cachedKey.postCryptoKey) {
        const result = decodeText(
            await cryptoProvider.decryptWithAES({
                aesKey: cachedKey.postCryptoKey,
                encrypted: encryptedText,
                iv: iv,
            }),
        )
        return [result, setCache] as const
    }
    return [undefined, setCache] as const
}

async function* iteratorHelper<T, R, N>(
    iter: AsyncGenerator<T, R, N>,
): AsyncGenerator<IteratorResult<T, R>, unknown, unknown> {
    let yielded: IteratorResult<T, R>
    do {
        yielded = await iter.next()
        if (yielded.done) yield yielded
        else yield yielded
    } while (yielded.done === false)
    return
}
