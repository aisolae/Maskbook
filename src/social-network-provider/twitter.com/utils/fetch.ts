import { regexMatch, downloadUrl } from '../../../utils/utils'
import { notNullable } from '../../../utils/assert'
import { defaultTo } from 'lodash-es'
import { nthChild } from '../../../utils/dom'
import { PersonIdentifier } from '../../../database/type'
import { twitterUrl } from './url'
import Services from '../../../extension/service'

/**
 * @example
 * parseNameArea("TheMirror\n(●'◡'●)@1\n@MisakaMirror")
 * >>> {
 *      name: "TheMirror(●'◡'●)@1",
 *      handle: "MisakaMirror"
 * }
 */
const parseNameArea = (t: string) => {
    const r = regexMatch(t, /((.+\s*)*)@(.+)/, null)!
    return {
        name: r[1].replace(/\n+/g, ''),
        handle: r[3].replace(/\n+/g, ''),
    }
}

const parseId = (t: string) => {
    return regexMatch(t, /status\/(\d+)/, 1)!
}

const isMobilePost = (node: HTMLElement) => {
    return node.classList.contains('tweet') ?? node.classList.contains('main-tweet')
}

export const bioCardParser = (cardNode: HTMLDivElement) => {
    if (cardNode.classList.contains('profile')) {
        const avatarElement = cardNode.querySelector<HTMLImageElement>('.avatar img')
        const { name, handle } = parseNameArea(
            [
                notNullable(cardNode.querySelector<HTMLTableCellElement>('.user-info .fullname')).innerText,
                notNullable(cardNode.querySelector<HTMLTableCellElement>('.user-info .screen-name')).innerText,
            ].join('@'),
        )
        const bio = notNullable(cardNode.querySelector('.details') as HTMLTableCellElement).innerText
        const isFollower = !!cardNode.querySelector<HTMLSpanElement>('.follows-you')
        const isFollowing =
            notNullable(cardNode.querySelector<HTMLFormElement>('.profile-actions form')).action.indexOf('unfollow') >
            -1
        return {
            avatar: avatarElement ? avatarElement.src : undefined,
            name,
            handle,
            identifier: new PersonIdentifier(twitterUrl.hostIdentifier, handle),
            bio,
            isFollower,
            isFollowing,
        }
    } else {
        const avatarElement = cardNode.querySelector<HTMLImageElement>('img')
        const { name, handle } = parseNameArea(notNullable(cardNode.children[1] as HTMLDivElement).innerText)
        const bio = notNullable(cardNode.children[2] as HTMLDivElement).innerHTML
        const isFollower = !!nthChild(cardNode, 1, 0, 0, 1, 1, 0)
        const isFollowing = !!cardNode.querySelector('[data-testid*="unfollow"]')
        return {
            avatar: avatarElement ? avatarElement.src : undefined,
            name,
            handle,
            identifier: new PersonIdentifier(twitterUrl.hostIdentifier, handle),
            bio,
            isFollower,
            isFollowing,
        }
    }
}

export const postIdParser = (node: HTMLElement) => {
    if (isMobilePost(node)) {
        const idNode = node.querySelector<HTMLAnchorElement>('.tweet-text')
        return idNode ? idNode.getAttribute('data-id') ?? undefined : undefined
    } else {
        const idNode = defaultTo(
            node.children[1].querySelector<HTMLAnchorElement>('a[href*="status"]'),
            node.parentElement!.querySelector<HTMLAnchorElement>('a[href*="status"]'),
        )
        return idNode ? parseId(idNode.href) : undefined
    }
}

export const postNameParser = (node: HTMLElement) => {
    if (isMobilePost(node)) {
        return parseNameArea(notNullable(node.querySelector<HTMLTableCellElement>('.user-info')).innerText)
    } else {
        const tweetElement = node.querySelector('[data-testid="tweet"]') ?? node
        return parseNameArea(notNullable(tweetElement.children[1].querySelector<HTMLAnchorElement>('a')).innerText)
    }
}

export const postAvatarParser = (node: HTMLElement) => {
    if (isMobilePost(node)) {
        const avatarElement = node.querySelector<HTMLImageElement>('.avatar img')
        return avatarElement ? avatarElement.src : undefined
    } else {
        const tweetElement = node.querySelector('[data-testid="tweet"]') ?? node
        const avatarElement = tweetElement.children[0].querySelector<HTMLImageElement>(`img[src*="twimg.com"]`)
        return avatarElement ? avatarElement.src : undefined
    }
}

export const postContentParser = (node: HTMLElement) => {
    if (isMobilePost(node)) {
        const containerNode = node.querySelector('.tweet-text > div')
        if (!containerNode) {
            return ''
        }
        return Array.from(containerNode.childNodes)
            .map(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    return node.nodeValue
                }
                if (node.nodeName === 'A') {
                    return (node as HTMLAnchorElement).getAttribute('title')
                }
                return ''
            })
            .join(',')
    } else {
        const select = <T extends HTMLElement>(selectors: string) =>
            Array.from(node.parentElement!.querySelectorAll<T>(selectors))
        const sto = [
            ...select<HTMLAnchorElement>('a').map(x => x.title),
            ...select<HTMLSpanElement>('[lang] > span').map(x => x.innerText),
        ]
        return sto.filter(Boolean).join(',')
    }
}

export const postImageParser = async (node: HTMLElement) => {
    if (isMobilePost(node)) {
        // TODO: Support steganography in legacy twitter
        return ''
    } else {
        const imgNodes = node.querySelectorAll<HTMLImageElement>('img[src*="twimg.com/media"]')
        if (!imgNodes.length) return ''
        const imgUrls = Array.from(imgNodes).map(node => node.getAttribute('src') ?? '')
        if (!imgUrls.length) return ''
        const { handle } = postNameParser(node)
        const posterIdentity = new PersonIdentifier(twitterUrl.hostIdentifier, handle)
        return (
            await Promise.all(
                imgUrls
                    .map(async url => {
                        const image = new Uint8Array(await downloadUrl(url))
                        const content = await Services.Steganography.decodeImage(image, {
                            pass: posterIdentity.toText(),
                        })
                        return /https:\/\/.+\..+\/%20(.+)%40/.test(content) ? content : ''
                    })
                    .filter(Boolean),
            )
        ).join('\n')
    }
}

export const postParser = (node: HTMLElement) => {
    return {
        ...postNameParser(node),
        avatar: postAvatarParser(node),
        pid: postIdParser(node),
        content: postContentParser(node),
    }
}
