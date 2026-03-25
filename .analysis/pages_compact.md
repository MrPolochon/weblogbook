/ | API: aucune | DB: aucune
/admin | API: aucune | DB: password_reset_requests, vols, plans_vol, aeroschool_responses, hangar_market_reventes
/admin/aeroschool | API: /api/aeroschool/forms | DB: aucune
/admin/aeroschool/[id] | API: aucune | DB: aucune
/admin/aeroschool/[id]/responses | API: aucune | DB: aucune
/admin/aeroschool/modules | API: /api/aeroschool/modules | DB: aucune
/admin/aeroschool/modules/[id] | API: aucune | DB: aucune
/admin/alliances | API: aucune | DB: profiles, alliances, compagnies, alliance_membres
/admin/armee | API: aucune | DB: profiles, felitz_comptes, vols
/admin/avions | API: aucune | DB: profiles
/admin/compagnies | API: aucune | DB: compagnies, profiles
/admin/compagnies/[id]/logbook | API: aucune | DB: profiles, compagnies, vols
/admin/documents | API: aucune | DB: document_sections
/admin/employes | API: aucune | DB: profiles, compagnies, compagnie_employes
/admin/felitz-bank | API: aucune | DB: profiles, felitz_comptes
/admin/hangar-market | API: aucune | DB: profiles, hangar_market_config, hangar_market, hangar_market_reventes
/admin/inventaire | API: aucune | DB: profiles
/admin/ips | API: aucune | DB: aucune
/admin/licences | API: aucune | DB: profiles, types_avion
/admin/militaire | API: aucune | DB: profiles, vols
/admin/militaire/vol/[id] | API: aucune | DB: profiles, vols
/admin/password-reset-requests | API: aucune | DB: profiles, password_reset_requests
/admin/pilotes | API: aucune | DB: profiles, user_login_tracking
/admin/pilotes/[id] | API: aucune | DB: profiles, cartes_identite
/admin/pilotes/[id]/logbook | API: aucune | DB: profiles, vols, vols_equipage_militaire
/admin/plans-vol | API: aucune | DB: profiles, plans_vol
/admin/reparation | API: aucune | DB: profiles, entreprises_reparation, reparation_employes, reparation_hangars, felitz_comptes
/admin/securite | API: aucune | DB: profiles, site_config
/admin/sid-star | API: aucune | DB: profiles
/admin/taxes | API: aucune | DB: profiles, taxes_aeroport
/admin/types-avion | API: aucune | DB: profiles, types_avion
/admin/vols | API: aucune | DB: profiles, vols, types_avion, compagnies
/aeroschool | API: /api/aeroschool/forms | DB: aucune
/aeroschool/[id] | API: aucune | DB: aucune
/alliance | API: aucune | DB: compagnies, compagnie_employes
/atc | API: aucune | DB: atc_sessions, plans_vol, afis_sessions, compagnie_avions, types_avion ...
/atc/admin | API: aucune | DB: profiles, atc_grades, atc_sessions
/atc/compte | API: aucune | DB: profiles, atc_grades
/atc/creer-plan | API: aucune | DB: atc_sessions
/atc/documents | API: aucune | DB: document_sections
/atc/felitz-bank | API: aucune | DB: profiles, felitz_comptes, felitz_transactions
/atc/messagerie | API: aucune | DB: profiles, messages
/atc/notams | API: aucune | DB: notams, profiles
/atc/plan/[id] | API: aucune | DB: plans_vol, profiles, compagnies, compagnie_avions, types_avion ...
/atc/spectateur/[userId] | API: aucune | DB: profiles, atc_sessions, plans_vol, compagnies, compagnie_avions
/compte | API: aucune | DB: profiles, cartes_identite
/documents | API: aucune | DB: document_sections
/download | API: aucune | DB: aucune
/felitz-bank | API: aucune | DB: felitz_comptes, profiles, compagnies, felitz_transactions
/hangar-market | API: aucune | DB: profiles, felitz_comptes, compagnies, inventaire_avions, plans_vol ...
/ifsa | API: aucune | DB: profiles, ifsa_signalements, ifsa_enquetes, ifsa_sanctions, compagnies ...
/ifsa/licences | API: aucune | DB: profiles, types_avion
/inventaire | API: aucune | DB: inventaire_avions, plans_vol
/logbook | API: aucune | DB: profiles, vols, plans_vol
/logbook/a-confirmer | API: aucune | DB: vols
/logbook/depot-plan-vol | API: aucune | DB: profiles, plans_vol, compagnie_employes, compagnies, inventaire_avions ...
/logbook/nouveau | API: aucune | DB: profiles, types_avion, compagnies, plans_vol
/logbook/plans-vol | API: aucune | DB: profiles, plans_vol
/logbook/plans-vol/[id]/modifier | API: aucune | DB: profiles, plans_vol
/logbook/vol/[id] | API: aucune | DB: profiles, vols, types_avion, compagnies
/login | API: /api/has-admin, /api/site-config, /api/auth/send-login-code, /api/auth/register-login ... | DB: profiles
/ma-compagnie | API: aucune | DB: compagnie_employes, compagnies, vols, plans_vol, felitz_comptes
/marche-cargo | API: aucune | DB: aeroport_cargo
/marche-passagers | API: aucune | DB: aeroport_passagers
/marketplace | API: aucune | DB: profiles, felitz_comptes, compagnies, types_avion
/messagerie | API: aucune | DB: messages, profiles
/militaire | API: aucune | DB: profiles, vols, vols_equipage_militaire
/militaire/nouveau | API: aucune | DB: profiles, armee_avions
/notams | API: aucune | DB: notams, profiles
/perf-ptfs | API: aucune | DB: aucune
/reparation | API: aucune | DB: aucune
/reparation/jeu/[demandeId] | API: aucune | DB: aucune
/setup | API: /api/has-admin, /api/setup | DB: aucune
/siavi | API: aucune | DB: afis_sessions, atc_sessions, profiles, plans_vol
/siavi/admin | API: aucune | DB: profiles, siavi_grades, afis_sessions
/siavi/compte | API: aucune | DB: profiles, siavi_grades
/siavi/documents | API: aucune | DB: document_sections
/siavi/felitz-bank | API: aucune | DB: profiles, felitz_comptes, felitz_transactions
/siavi/messagerie | API: aucune | DB: profiles, messages
/siavi/plan/[id] | API: aucune | DB: profiles, afis_sessions, plans_vol, compagnies, compagnie_avions ...
/signalement | API: aucune | DB: ifsa_signalements, profiles, compagnies
