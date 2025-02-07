/// <reference path="./global.d.ts" />
import { DBSchema, openDB } from 'idb/with-async-ittr'
import { GroupIdentifier, Identifier, PersonIdentifier } from './type'
import { MessageCenter } from '../utils/messages'

//#region Schema
interface GroupRecordBase {
    members: PersonIdentifier[]
    /**
     * Ban list of this group.
     * Only used for virtual group currently
     *
     * Used to remember if user clicks
     * > they is not my friend, don't add them to my auto-share list again!
     */
    banned?: PersonIdentifier[]
    /** Index */
    network: string
    groupName: string
}
interface GroupRecordInDatabase extends GroupRecordBase {
    identifier: string
}
export interface GroupRecord extends Omit<GroupRecordBase, 'network'> {
    identifier: GroupIdentifier
}
interface GroupDB extends DBSchema {
    /** Key is value.identifier */
    groups: {
        value: GroupRecordInDatabase
        key: string
        indexes: {
            // Use `network` field as index
            network: string
        }
    }
}
//#endregion

const db = openDB<GroupDB>('maskbook-user-groups', 1, {
    upgrade(db, oldVersion, newVersion, transaction) {
        // Out line keys
        db.createObjectStore('groups', { keyPath: 'identifier' })
        transaction.objectStore('groups').createIndex('network', 'network', { unique: false })
    },
})

/**
 * This function create a new user group
 * It will return a GroupIdentifier
 * @param group GroupIdentifier
 * @param groupName
 */
export async function createUserGroupDatabase(group: GroupIdentifier, groupName: string): Promise<void> {
    const t = (await db).transaction('groups', 'readwrite')
    await t.objectStore('groups').put({
        groupName,
        identifier: group.toText(),
        members: [],
        network: group.network,
    })
}

/**
 * Delete a user group that stored in the Maskbook
 * @param group Group ID
 */
export async function deleteUserGroupDatabase(group: GroupIdentifier): Promise<void> {
    const t = (await db).transaction('groups', 'readwrite')
    await t.objectStore('groups').delete(group.toText())
}

/**
 * Update a user group that stored in the Maskbook
 * @param group Group ID
 * @param type
 */
export async function updateUserGroupDatabase(
    group: Partial<GroupRecord> & Pick<GroupRecord, 'identifier'>,
    type: 'append' | 'replace' | ((record: GroupRecord) => GroupRecord | void),
): Promise<void> {
    const orig = await queryUserGroupDatabase(group.identifier)
    if (!orig) throw new TypeError('User group not found')

    const t = (await db).transaction('groups', 'readwrite')
    let nextRecord: GroupRecord
    const nonDuplicateNewMembers: PersonIdentifier[] = []
    if (type === 'replace') {
        nextRecord = { ...orig, ...group }
    } else if (type === 'append') {
        const nextMembers = new Set<string>()
        for (const i of orig.members) {
            nextMembers.add(i.toText())
        }
        for (const i of group.members || []) {
            if (!nextMembers.has(i.toText())) {
                nextMembers.add(i.toText())
                nonDuplicateNewMembers.push(i)
            }
        }
        nextRecord = {
            identifier: group.identifier,
            banned: !orig.banned && !group.banned ? undefined : [...(orig.banned || []), ...(group.banned || [])],
            groupName: group.groupName || orig.groupName,
            members: Array.from(nextMembers).map(x => Identifier.fromString(x) as PersonIdentifier),
        }
    } else {
        nextRecord = type(orig) || orig
    }
    await t.objectStore('groups').put(GroupRecordIntoDB(nextRecord))
    nonDuplicateNewMembers.length &&
        MessageCenter.emit(
            'joinGroup',
            {
                group: group.identifier,
                newMembers: nonDuplicateNewMembers,
            },
            true,
        )
}

/**
 * Query a user group that stored in the Maskbook
 * @param group Group ID
 */
export async function queryUserGroupDatabase(group: GroupIdentifier): Promise<null | GroupRecord> {
    const t = (await db).transaction('groups', 'readonly')
    const result = await t.objectStore('groups').get(group.toText())
    if (!result) return null
    return GroupRecordOutDB(result)
}

/**
 * Query user groups that stored in the Maskbook
 * @param query Query ID
 */
export async function queryUserGroupsDatabase(
    query: ((key: GroupIdentifier, record: GroupRecordInDatabase) => boolean) | { network: string },
): Promise<GroupRecord[]> {
    const t = (await db).transaction('groups')
    const result: GroupRecordInDatabase[] = []
    if (typeof query === 'function') {
        // eslint-disable-next-line @typescript-eslint/await-thenable
        for await (const { value, key } of t.store) {
            if (query(Identifier.fromString(key) as GroupIdentifier, value)) result.push(value)
        }
    } else {
        result.push(
            ...(await t
                .objectStore('groups')
                .index('network')
                .getAll(IDBKeyRange.only(query.network))),
        )
    }
    return result.map(GroupRecordOutDB)
}

function GroupRecordOutDB(x: GroupRecordInDatabase): GroupRecord {
    // recover prototype
    x.members.forEach(x => Object.setPrototypeOf(x, PersonIdentifier.prototype))
    x.banned && x.banned.forEach(x => Object.setPrototypeOf(x, PersonIdentifier.prototype))
    const id = Identifier.fromString(x.identifier)
    if (!(id instanceof GroupIdentifier))
        throw new TypeError('Can not cast string ' + x.identifier + ' into GroupIdentifier')
    return {
        ...x,
        identifier: id,
    }
}
function GroupRecordIntoDB(x: GroupRecord): GroupRecordInDatabase {
    return {
        ...x,
        identifier: x.identifier.toText(),
        network: x.identifier.network,
    }
}
