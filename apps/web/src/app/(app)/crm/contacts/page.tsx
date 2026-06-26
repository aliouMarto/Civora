import { redirect } from 'next/navigation';

/**
 * Redirection : l'historique du sidebar pointait sur /crm/contacts.
 * Les routes du module Contacts vivent désormais à la racine /contacts
 * (Lot 1 · Module 1). On garde l'ancienne URL accessible pour ne pas
 * casser les liens externes.
 */
export default function CrmContactsRedirect(): never {
  redirect('/contacts');
}
