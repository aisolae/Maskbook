import React, { useMemo, useState } from 'react'
import { makeStyles } from '@material-ui/core/styles'
import Card from '@material-ui/core/Card'
import CardContent from '@material-ui/core/CardContent'
import Typography from '@material-ui/core/Typography'
import { PersonIdentifier } from '../../../database/type'
import { useTextField } from '../../../utils/components/useForms'
import { DecryptPost } from '../../../components/InjectedComponents/DecryptedPost'
import { useIsolatedChooseIdentity } from '../../../components/shared/ChooseIdentity'
import { FormControlLabel, Checkbox } from '@material-ui/core'

export function DecryptPostDeveloperMode() {
    const [whoAmI, chooseIdentity] = useIsolatedChooseIdentity()
    // const [network, networkInput] = useTextField('Network', { defaultValue: 'facebook.com', required: true })
    const [postByMyself, setPostByMyself] = useState(false)
    const [author, authorInput] = useTextField('Author ID of this post', {
        required: !postByMyself,
        disabled: postByMyself,
    })
    const [encryptedText, encryptedTextInput] = useTextField('Encrypted post', {
        placeholder: '🎼3/4|ownersAESKeyEncrypted|iv|encryptedText|signature:||',
        required: true,
    })
    const network = whoAmI ? whoAmI.identifier.network : 'localhost'
    const authorIdentifier = useMemo(() => new PersonIdentifier(network, author), [network, author])
    const whoAmIIdentifier = whoAmI ? whoAmI.identifier : PersonIdentifier.unknown
    return (
        <Card>
            <CardContent>
                <Typography color="textSecondary" gutterBottom>
                    Decrypt post manually
                </Typography>
                <Typography variant="caption" gutterBottom>
                    Your identity?
                </Typography>
                {chooseIdentity}
                {/* {networkInput} */}
                <FormControlLabel
                    control={<Checkbox checked={postByMyself} onChange={(e, a) => setPostByMyself(a)} />}
                    label="Post by myself"
                />
                {authorInput}
                {encryptedTextInput}
                <div style={{ minHeight: 200 }}>
                    <DecryptPost
                        disableSuccessDecryptionCache
                        alreadySelectedPreviously={[]}
                        encryptedText={encryptedText}
                        onDecrypted={post => {}}
                        people={[]}
                        postBy={postByMyself ? whoAmIIdentifier : authorIdentifier}
                        whoAmI={whoAmIIdentifier}
                    />
                </div>
            </CardContent>
        </Card>
    )
}
