'use client';

import type { ComponentProps } from 'react';
import MessagerieBase from '@/components/MessagerieBase';

const SIAVI_CHEQUE_TYPES = ['cheque_salaire', 'cheque_siavi_intervention', 'cheque_siavi_taxes'];

type Props = Pick<ComponentProps<typeof MessagerieBase>,
  'messagesRecus' | 'messagesEnvoyes' | 'utilisateurs' | 'currentUserIdentifiant' | 'isAdmin'
>;

export default function MessagerieSiaviClient(props: Props) {
  return (
    <MessagerieBase
      {...props}
      colorTheme="orange"
      title="Messagerie SIAVI"
      chequeTypes={SIAVI_CHEQUE_TYPES}
    />
  );
}
