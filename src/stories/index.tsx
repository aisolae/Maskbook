import './Welcome'
import './OptionsPage'
import './Injections'
import './shared'
import { definedSocialNetworkUIs, defineSocialNetworkUI, activateSocialNetworkUI } from '../social-network/ui'
import { demoPeople, demoGroup } from './demoPeopleOrGroups'
import { ValueRef } from '@holoflows/kit/es'
import { PersonIdentifier } from '../database/type'
import { emptyDefinition } from '../social-network/defaults/emptyDefinition'
import { Person } from '../database'

definedSocialNetworkUIs.clear()
defineSocialNetworkUI({
    ...emptyDefinition,
    friendlyName: 'Utopia',
    setupAccount: 'Setup your Utopia account in your dream',
    shouldActivate() {
        return true
    },
    myIdentitiesRef: new ValueRef(demoPeople),
    groupsRef: new ValueRef(demoGroup),
    lastRecognizedIdentity: new ValueRef({ identifier: PersonIdentifier.unknown }),
    currentIdentity: new ValueRef<Person | null>(null),
    friendsRef: new ValueRef(demoPeople),
})
defineSocialNetworkUI({ ...emptyDefinition, friendlyName: 'Neoparia Breakfast Club' })
defineSocialNetworkUI({
    ...emptyDefinition,
    friendlyName: 'telnet',
    setupAccount: 'Embrace the eternal September!',
    isDangerousNetwork: true as false,
})
defineSocialNetworkUI({
    ...emptyDefinition,
    friendlyName: 'MySpace',
    isDangerousNetwork: true as false,
})
activateSocialNetworkUI()
