import { useValueRef } from '../../utils/hooks/useValueRef'
import { ValueRef } from '@holoflows/kit/es'
import { deconstructPayload } from '../../utils/type-transform/Payload'
import React from 'react'
import { Input } from '@material-ui/core'
import { decodeArrayBuffer, decodeText } from '../../utils/type-transform/String-ArrayBuffer'
import { DecryptPostUI } from '../../components/InjectedComponents/DecryptedPost'

export function MediumUnlockInspectPost(props: { content: ValueRef<string> }) {
    const c = useValueRef(props.content)
    const payload = deconstructPayload(c, x => x, false)
    const [aes, setAes] = React.useState('')
    const [decrypted, setDecrypted] = React.useState('')
    async function setKey(value: string) {
        setAes(value)
        try {
            const aesKey = await crypto.subtle.importKey('jwk', JSON.parse(value), 'AES-GCM', true, ['decrypt'])
            const val = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: decodeArrayBuffer(payload!.iv) },
                aesKey,
                decodeArrayBuffer(payload!.encryptedText),
            )
            setDecrypted(decodeText(val))
        } catch (e) {
            console.error(e)
        }
    }
    if (payload === null) return null
    return (
        <>
            <Input
                placeholder="Please receive the aes key from Unlock"
                value={aes}
                onChange={e => setKey(e.currentTarget.value)}></Input>
            {decrypted ? (
                <DecryptPostUI.success
                    alreadySelectedPreviously={[]}
                    data={{ content: decrypted, signatureVerifyResult: true }}
                    people={[]}
                />
            ) : (
                <DecryptPostUI.awaiting />
            )}
        </>
    )
}
