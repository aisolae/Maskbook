import { PersonIdentifier } from '../../../database/type'
import { getProfilePageUrlAtFacebook } from '../parse-username'
import { parseFacebookStaticHTML } from '../parse-html'
import { Profile } from '../../../social-network/shared'
import tasks from '../../../extension/content-script/tasks'
import { timeout } from '../../../utils/utils'
import { facebookWorkerSelf } from '../worker-provider'
import { isNil } from 'lodash-es'
import { getActiveTabFacebook } from '../../../utils/tabs'

// ? We now always run fetch request from an active tab.
// ? If failed, we will fallback to open a new tab to do this.
export async function fetchProfileFacebook(who: PersonIdentifier): Promise<Profile> {
    const activeTabID = await getActiveTabFacebook()
    if (activeTabID) {
        const url = getProfilePageUrlAtFacebook(who, 'fetch')
        const { memoizeFetch } = tasks(activeTabID)
        const html = await timeout(memoizeFetch(url), 10000).catch(_ => null)
        if (html !== null) {
            // Path 1: fetch by http req
            try {
                const doc = parseFacebookStaticHTML(html)
                if (!doc.length) throw new Error("Can't parse the page")
                const bio = doc
                    .map(
                        doc =>
                            doc.querySelector<HTMLDivElement>('#intro_container_id') ||
                            doc.querySelector<HTMLDivElement>('#bio') ||
                            doc.querySelector<HTMLDivElement>('div > div > div:nth-child(2) > div:nth-child(2)'),
                    )
                    .map(x => x && x.innerText)
                    .join('')
                if (isNil(facebookWorkerSelf.publicKeyDecoder(bio))) throw new Error("Can't find bio")
                return { bioContent: bio }
            } catch (e) {
                console.warn(e)
                memoizeFetch.cache?.delete(url)
            }
        }
    }

    // Path 2: fetch by tab task
    return tasks(getProfilePageUrlAtFacebook(who, 'open')).getProfile(who)
}
