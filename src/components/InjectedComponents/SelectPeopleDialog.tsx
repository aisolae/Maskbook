import React, { useCallback, useState } from 'react'
import { SelectPeopleAndGroupsUI, SelectPeopleAndGroupsUIProps } from '../shared/SelectPeopleAndGroups'
import { geti18nString } from '../../utils/i18n'
import { makeStyles } from '@material-ui/styles'
import {
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    withMobileDialog,
} from '@material-ui/core'
import { Person } from '../../database'
import { PortalShadowRoot } from '../../utils/jss/ShadowRootPortal'
import { useStylesExtends } from '../custom-ui-helper'

export interface SelectPeopleDialogProps extends withClasses<KeysInferFromUseStyles<typeof useStyles, 'content'>> {
    open: boolean
    people: Person[]
    alreadySelectedPreviously: Person[]
    onClose: () => void
    onSelect: (people: Person[]) => Promise<void>
    SelectPeopleAndGroupsUIProps?: SelectPeopleAndGroupsUIProps<Person>
}
const useStyles = makeStyles({
    title: { paddingBottom: 0 },
    content: { padding: '0 12px' },
    progress: { marginRight: 6 },
})
const ResponsiveDialog = withMobileDialog({ breakpoint: 'xs' })(Dialog)
export function SelectPeopleDialog(props: SelectPeopleDialogProps) {
    const classes = useStylesExtends(useStyles(), props)
    const [people, select] = useState<Person[]>([] as Person[])
    const [committed, setCommitted] = useState(false)
    const onClose = useCallback(() => {
        props.onClose()
        setCommitted(false)
        select([])
    }, [props])
    const [rejection, onReject] = useState<Error>()
    const share = useCallback(() => {
        setCommitted(true)
        props.onSelect(people).then(onClose, onReject)
    }, [onClose, people, props])

    const canClose = !rejection && committed
    const canCommit = committed || people.length === 0
    return (
        <ResponsiveDialog
            disableEnforceFocus
            container={PortalShadowRoot}
            onClose={canClose ? onClose : void 0}
            open={props.open}
            scroll="paper"
            fullWidth
            maxWidth="sm">
            <DialogTitle className={classes.title}>{geti18nString('share_to')}</DialogTitle>
            <DialogContent className={classes.content}>
                <SelectPeopleAndGroupsUI<Person>
                    frozenSelected={props.alreadySelectedPreviously}
                    disabled={committed}
                    items={props.people}
                    selected={people}
                    onSetSelected={select}
                    {...props.SelectPeopleAndGroupsUIProps}
                />
            </DialogContent>
            {rejection && (
                <DialogContent className={classes.content}>
                    Error: {rejection.message} {console.error(rejection)}
                </DialogContent>
            )}
            <DialogActions>
                <Button size="large" disabled={canClose} onClick={onClose}>
                    {geti18nString('cancel')}
                </Button>
                <Button size="large" disabled={canCommit} color="primary" onClick={share}>
                    {committed && (
                        <CircularProgress aria-busy className={classes.progress} size={16} variant="indeterminate" />
                    )}
                    {geti18nString(committed ? 'sharing' : 'share')}
                </Button>
            </DialogActions>
        </ResponsiveDialog>
    )
}

export function useShareMenu(
    people: Person[],
    onSelect: (people: Person[]) => Promise<void>,
    alreadySelectedPreviously: Person[],
    SelectPeopleDialogProps?: Partial<SelectPeopleDialogProps>,
) {
    const [show, setShow] = useState(false)
    const showShare = useCallback(() => setShow(true), [])
    const hideShare = useCallback(() => setShow(false), [])

    return {
        showShare,
        ShareMenu: (
            <SelectPeopleDialog
                alreadySelectedPreviously={alreadySelectedPreviously}
                people={people}
                open={show}
                onClose={hideShare}
                onSelect={onSelect}
                {...SelectPeopleDialogProps}
            />
        ),
    }
}
