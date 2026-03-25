## admin_password_reset_codes
- code (TEXT)
- expires_at (TIMESTAMPTZ)
- user_id (UUID)

## aeroport_passagers
- id (UUID)
- updated_at (TIMESTAMPTZ)

## aeroports_siavi
- created_at (TIMESTAMPTZ)
- nom (TEXT)

## aeroschool_forms
- (colonnes non détectées)

## afis_sessions
- aeroport (TEXT)
- id (UUID)
- started_at (TIMESTAMPTZ)
- user_id (UUID)

## alliance_annonces
- alliance_id (UUID)
- auteur_id (UUID)
- created_at (TIMESTAMPTZ)
- id (UUID)

## alliance_avions_membres
- alliance_id (UUID)
- compagnie_avion_id (UUID)
- compagnie_beneficiaire_id (UUID)
- compagnie_proprio_id (UUID)
- created_at (TIMESTAMPTZ)
- id (UUID)

## alliance_contributions
- alliance_id (UUID)
- compagnie_id (UUID)
- created_at (TIMESTAMPTZ)
- id (UUID)

## alliance_demandes_fonds
- alliance_id (UUID)
- compagnie_id (UUID)
- created_at (TIMESTAMPTZ)
- demandeur_id (UUID)
- id (UUID)
- statut (TEXT)
- traite_at (TIMESTAMPTZ)

## alliance_invitations
- alliance_id (UUID)
- compagnie_id (UUID)
- created_at (TIMESTAMPTZ)
- id (UUID)
- invite_par_id (UUID)
- statut (TEXT)
- traite_at (TIMESTAMPTZ)

## alliance_membres
- alliance_id (UUID)
- compagnie_id (UUID)
- id (UUID)
- joined_at (TIMESTAMPTZ)
- role (TEXT)

## alliance_parametres
- alliance_id (UUID)
- updated_at (TIMESTAMPTZ)

## alliance_transferts_avions
- alliance_id (UUID)
- compagnie_avion_id (UUID)
- compagnie_dest_id (UUID)
- compagnie_source_id (UUID)
- created_at (TIMESTAMPTZ)
- from_compagnie_id (UUID)
- id (UUID)
- statut (TEXT)
- to_compagnie_id (UUID)
- traite_at (TIMESTAMPTZ)

## alliances
- created_at (TIMESTAMPTZ)
- created_by_compagnie_id (UUID)
- id (UUID)
- logo_url (TEXT)
- nom (TEXT)

## armee_avions
- created_at (TIMESTAMPTZ)
- detruit_at (TIMESTAMPTZ)
- id (UUID)
- type_avion_id (UUID)

## armee_missions_log
- created_at (TIMESTAMPTZ)
- id (UUID)
- mission_id (TEXT)
- user_id (UUID)

## atc_calls
- answered_at (TIMESTAMPTZ)
- created_at (TIMESTAMPTZ)
- ended_at (TIMESTAMPTZ)
- from_user_id (UUID)
- id (UUID)
- started_at (TIMESTAMPTZ)
- status (TEXT)
- to_user_id (UUID)

## atc_grades
- created_at (TIMESTAMPTZ)
- id (UUID)
- nom (TEXT)

## atc_plans_controles
- aeroport (TEXT)
- created_at (TIMESTAMPTZ)
- id (UUID)
- plan_vol_id (UUID)
- position (TEXT)
- user_id (UUID)

## atc_sessions
- aeroport (TEXT)
- id (UUID)
- position (TEXT)
- started_at (TIMESTAMPTZ)
- user_id (UUID)

## atc_taxes_pending
- aeroport (TEXT)
- created_at (TIMESTAMPTZ)
- id (UUID)
- plan_vol_id (UUID)
- session_id (UUID)
- user_id (UUID)

## atis_broadcast_config
- discord_channel_id (TEXT)
- discord_guild_id (TEXT)
- id (TEXT)
- updated_at (TIMESTAMPTZ)

## atis_broadcast_state
- aeroport (TEXT)
- controlling_user_id (UUID)
- id (TEXT)
- position (TEXT)
- started_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)

## autorisations_exploitation
- compagnie_id (UUID)
- created_at (TIMESTAMPTZ)
- demandeur_id (UUID)
- id (UUID)
- statut (TEXT)
- traite_at (TIMESTAMPTZ)
- traite_par_id (UUID)
- type_avion_id (UUID)
- updated_at (TIMESTAMPTZ)

## cartes_identite
- created_at (TIMESTAMPTZ)
- id (UUID)
- logo_url (TEXT)
- photo_url (TEXT)
- updated_at (TIMESTAMPTZ)
- user_id (UUID)

## compagnie_avions
- compagnie_id (UUID)
- created_at (TIMESTAMPTZ)
- id (UUID)
- maintenance_fin_at (TIMESTAMPTZ DEFAULT NULL)
- statut (TEXT)
- type_avion_id (UUID)
- updated_at (TIMESTAMPTZ)

## compagnie_employes
- compagnie_id (UUID)
- id (UUID)
- pilote_id (UUID)

## compagnie_flotte
- compagnie_id (UUID)
- id (UUID)
- type_avion_id (UUID)

## compagnie_hubs
- compagnie_id (UUID)
- created_at (TIMESTAMPTZ)
- id (UUID)

## compagnie_locations
- accepted_at (TIMESTAMPTZ)
- avion_id (UUID)
- cancelled_at (TIMESTAMPTZ)
- created_at (TIMESTAMPTZ)
- end_at (TIMESTAMPTZ)
- id (UUID)
- last_billed_at (TIMESTAMPTZ)
- locataire_compagnie_id (UUID)
- loueur_compagnie_id (UUID)
- start_at (TIMESTAMPTZ)
- statut (TEXT)

## compagnies
- alliance_id (UUID REFERENCES public.alliances(id) ON DELETE SET NULL)
- created_at (TIMESTAMPTZ)
- dernier_changement_principal_at (TIMESTAMPTZ)
- id (UUID)
- logo_url (TEXT)
- nom (TEXT)
- pdg_id (UUID REFERENCES public.profiles(id) ON DELETE SET NULL)
- updated_at (TIMESTAMPTZ NOT NULL DEFAULT now())

## deletion_logs
- deleted_at (TIMESTAMPTZ)
- deleted_by_id (UUID)
- deleted_profile_id (UUID)
- id (UUID)

## document_files
- created_at (TIMESTAMPTZ)
- id (UUID)
- section_id (UUID)

## document_sections
- created_at (TIMESTAMPTZ)
- id (UUID)
- nom (TEXT)
- parent_id (UUID REFERENCES public.document_sections(id) ON DELETE CASCADE)
- updated_at (TIMESTAMPTZ)

## entreprises_reparation
- created_at (TIMESTAMPTZ)
- id (UUID)
- logo_url (TEXT)
- nom (TEXT)
- pdg_id (UUID)
- updated_at (TIMESTAMPTZ)

## felitz_comptes
- alliance_id (UUID REFERENCES public.alliances(id) ON DELETE CASCADE)
- compagnie_id (UUID)
- created_at (TIMESTAMPTZ)
- entreprise_reparation_id (UUID REFERENCES public.entreprises_reparation(id) ON DELETE CASCADE)
- id (UUID)
- proprietaire_id (UUID)

## felitz_transactions
- compte_id (UUID)
- created_at (TIMESTAMPTZ)
- id (UUID)
- reference_id (UUID)

## felitz_virements
- compte_source_id (UUID)
- created_at (TIMESTAMPTZ)
- id (UUID)

## hangar_market
- acheteur_id (UUID)
- compagnie_acheteur_id (UUID)
- compagnie_avion_id (UUID REFERENCES public.compagnie_avions(id) ON DELETE SET NULL)
- compagnie_vendeur_id (UUID)
- created_at (TIMESTAMPTZ)
- flotte_avion_id (UUID)
- id (UUID)
- inventaire_avion_id (UUID)
- statut (TEXT)
- type_avion_id (UUID)
- updated_at (TIMESTAMPTZ)
- vendeur_id (UUID)
- vendu_at (TIMESTAMPTZ)

## hangar_market_config
- created_at (TIMESTAMPTZ)
- id (UUID)
- updated_at (TIMESTAMPTZ)

## hangar_market_reventes
- admin_id (UUID)
- compagnie_avion_id (UUID)
- compagnie_id (UUID)
- created_at (TIMESTAMPTZ)
- demandeur_id (UUID)
- execute_at (TIMESTAMPTZ)
- id (UUID)
- inventaire_avion_id (UUID)
- statut (TEXT)
- traite_at (TIMESTAMPTZ)
- type_avion_id (UUID)

## inventaire_avions
- created_at (TIMESTAMPTZ)
- id (UUID)
- proprietaire_id (UUID)
- type_avion_id (UUID)

## licences_qualifications
- created_at (TIMESTAMPTZ)
- id (UUID)
- type_avion_id (UUID)
- user_id (UUID)

## login_ip_history
- created_at (TIMESTAMPTZ)
- id (UUID)
- ip (TEXT)
- user_id (UUID)

## login_verification_codes
- code (TEXT)
- created_at (TIMESTAMPTZ)
- expires_at (TIMESTAMPTZ)
- user_id (UUID)

## messages
- created_at (TIMESTAMPTZ)
- destinataire_id (UUID)
- expediteur_id (UUID REFERENCES public.profiles(id) ON DELETE SET NULL)
- id (UUID)

## notams
- au_at (TIMESTAMPTZ)
- created_at (TIMESTAMPTZ)
- du_at (TIMESTAMPTZ)
- id (UUID)

## password_reset_requests
- created_at (TIMESTAMPTZ)
- id (UUID)
- status (TEXT)
- user_id (UUID)

## password_reset_tokens
- expires_at (TIMESTAMPTZ)
- token (TEXT)
- user_id (UUID)

## plans_vol
- accepted_at (TIMESTAMPTZ)
- compagnie_avion_id (UUID REFERENCES public.compagnie_avions(id) ON DELETE SET NULL)
- compagnie_id (UUID REFERENCES public.compagnies(id) ON DELETE SET NULL)
- created_at (TIMESTAMPTZ)
- current_afis_user_id (UUID REFERENCES public.profiles(id) ON DELETE SET NULL)
- current_holder_user_id (UUID)
- demande_cloture_at (TIMESTAMPTZ)
- id (UUID)
- location_id (UUID REFERENCES public.compagnie_locations(id) ON DELETE SET NULL)
- pilote_id (UUID)
- statut (TEXT)
- type_vol (TEXT)
- updated_at (TIMESTAMPTZ)

## prets_bancaires
- compagnie_id (UUID)
- created_at (TIMESTAMPTZ)
- demandeur_id (UUID)
- id (UUID)
- rembourse_at (TIMESTAMPTZ)
- statut (TEXT)

## profiles
- atc_grade_id (UUID REFERENCES public.atc_grades(id) ON DELETE SET NULL)
- block_reason (TEXT)
- blocked_until (TIMESTAMPTZ)
- created_at (TIMESTAMPTZ)
- email (TEXT)
- id (UUID)
- role (TEXT)
- siavi_grade_id (UUID REFERENCES public.siavi_grades(id) ON DELETE SET NULL)
- updated_at (TIMESTAMPTZ)

## reparation_demandes
- acceptee_at (TIMESTAMPTZ)
- avion_id (UUID)
- compagnie_id (UUID)
- completee_at (TIMESTAMPTZ)
- created_at (TIMESTAMPTZ)
- debut_reparation_at (TIMESTAMPTZ)
- entreprise_id (UUID)
- facturee_at (TIMESTAMPTZ)
- fin_reparation_at (TIMESTAMPTZ)
- hangar_id (UUID)
- id (UUID)
- payee_at (TIMESTAMPTZ)
- statut (TEXT)

## reparation_employes
- created_at (TIMESTAMPTZ)
- entreprise_id (UUID)
- id (UUID)
- role (TEXT)
- user_id (UUID)

## reparation_hangars
- created_at (TIMESTAMPTZ)
- entreprise_id (UUID)
- id (UUID)
- nom (TEXT)

## reparation_mini_jeux_scores
- completed_at (TIMESTAMPTZ)
- demande_id (UUID)
- id (UUID)

## reparation_tarifs
- created_at (TIMESTAMPTZ)
- entreprise_id (UUID)
- id (UUID)
- type_avion_id (UUID)

## security_logout
- created_at (TIMESTAMPTZ)
- user_id (UUID)

## siavi_grades
- created_at (TIMESTAMPTZ)
- id (UUID)
- nom (TEXT)

## siavi_interventions
- aeroport (TEXT)
- call_id (UUID)
- created_at (TIMESTAMPTZ)
- id (UUID)
- user_id (UUID)

## sid_star
- aeroport (TEXT)
- created_at (TIMESTAMPTZ)
- id (UUID)
- nom (TEXT)

## site_config
- id (INTEGER)
- updated_at (TIMESTAMPTZ)

## superadmin_access_codes
- code (TEXT)
- expires_at (TIMESTAMPTZ)
- user_id (UUID)

## superadmin_ip_requests
- approved_at (TIMESTAMPTZ)
- created_at (TIMESTAMPTZ)
- id (UUID)
- status (TEXT)

## tarifs_liaisons
- compagnie_id (UUID)
- created_at (TIMESTAMPTZ)
- id (UUID)
- updated_at (TIMESTAMPTZ)

## taxes_aeroport
- id (UUID)

## types_avion
- id (UUID)
- nom (TEXT)

## user_login_tracking
- last_login_at (TIMESTAMPTZ)
- user_id (UUID)

## vhf_position_frequencies
- aeroport (TEXT)
- created_at (TIMESTAMPTZ)
- frequency (TEXT)
- id (UUID)
- position (TEXT)

## vols
- armee_avion_id (UUID REFERENCES public.armee_avions(id) ON DELETE SET NULL)
- chef_escadron_id (UUID REFERENCES public.profiles(id) ON DELETE SET NULL)
- compagnie_id (UUID)
- copilote_id (UUID REFERENCES public.profiles(id) ON DELETE SET NULL)
- created_at (TIMESTAMPTZ)
- created_by_user_id (UUID)
- editing_by_pilot_id (UUID)
- editing_started_at (TIMESTAMPTZ)
- id (UUID)
- instructeur_id (UUID REFERENCES public.profiles(id) ON DELETE SET NULL)
- mission_id (TEXT)
- pilote_id (UUID)
- statut (TEXT)
- type_avion_id (UUID)
- type_vol (TEXT)
- updated_at (TIMESTAMPTZ)

## vols_archive
- created_at (TIMESTAMPTZ)
- id (UUID)
- purge_at (TIMESTAMPTZ)
- type_vol (TEXT)

## vols_equipage_militaire
- profile_id (UUID)
- vol_id (UUID)

## vols_ferry
- avion_id (UUID)
- compagnie_id (UUID)
- completed_at (TIMESTAMPTZ)
- created_at (TIMESTAMPTZ)
- id (UUID)
- pilote_id (UUID)
- statut (TEXT)

