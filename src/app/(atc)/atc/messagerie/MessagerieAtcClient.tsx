'use client';

import type { ComponentProps } from 'react';
import MessagerieBase from '@/components/MessagerieBase';

const ATC_CHEQUE_TYPES = ['cheque_salaire', 'cheque_revenu_compagnie', 'cheque_taxes_atc'];

type Props = Pick<ComponentProps<typeof MessagerieBase>,
  'messagesRecus' | 'messagesEnvoyes' | 'utilisateurs' | 'currentUserIdentifiant' | 'isAdmin'
>;

export default function MessagerieAtcClient(props: Props) {
  return (
    <MessagerieBase
      {...props}
      colorTheme="emerald"
      title="Messagerie ATC"
      chequeTypes={ATC_CHEQUE_TYPES}
    />
  );
}
