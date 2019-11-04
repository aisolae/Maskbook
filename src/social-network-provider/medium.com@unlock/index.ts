import { SocialNetworkWorkerAndUIDefinition } from '../../social-network/shared'

export const sharedSettingsMediumUnlock: SocialNetworkWorkerAndUIDefinition = {
    version: 1,
    internalName: 'medium@unlock',
    isDangerousNetwork: false,
    networkIdentifier: 'medium.com@unlock',
    isValidUsername: () => true,
    acceptablePayload: ['v38', 'latest'],
    init() {},
    notReadyForProduction: true,
}
