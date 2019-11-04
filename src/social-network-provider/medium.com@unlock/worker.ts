import { defineSocialNetworkWorker } from '../../social-network/worker'
import { sharedSettingsMediumUnlock } from '.'

const nil = () => {
    throw new Error('Not implemented at medium.com@unlock')
}
export const twitterWorkerSelf = defineSocialNetworkWorker({
    ...sharedSettingsMediumUnlock,
    fetchPostContent: nil,
    fetchProfile: nil,
    autoVerifyBio: nil,
    autoVerifyPost: nil,
    manualVerifyPost: nil,
})
