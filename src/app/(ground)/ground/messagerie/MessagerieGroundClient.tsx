'use client';

import type { ComponentProps } from 'react';
import MessagerieBase from '@/components/MessagerieBase';

const GROUND_CHEQUE_TYPES = ['cheque_salaire'];

type Props = Pick<ComponentProps<typeof MessagerieBase>,
  'messagesRecus' | 'messagesEnvoyes' | 'utilisateurs' | 'currentUserIdentifiant' | 'isAdmin'
>;

export default function MessagerieGroundClient(props: Props) {
  return (
    <MessagerieBase
      {...props}
      colorTheme="blue"
      title="Messagerie Ground Crew"
      chequeTypes={GROUND_CHEQUE_TYPES}
    />
  );
}
