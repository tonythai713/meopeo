// Projet Supabase de MeoPeo.
// La clé « publishable » est publique par conception : elle peut être dans le code et sur GitHub.
// La sécurité vient des règles d'accès de la base (supabase/01_schema.sql). Ne JAMAIS mettre ici la clé service_role.
export const SUPABASE_URL = "https://llwbzhlbaygolzuwlbkf.supabase.co";
export const SUPABASE_KEY = "sb_publishable_rMCGFrjzDmhsZ6eJ163B6g_MTA4dQSd";
// Clé PUBLIQUE des notifications (sa partie privée est uniquement dans les secrets de la fonction Supabase send-push)
export const VAPID_PUBLIC_KEY = "BOAQ_3p7czPy39jQ12z-ySbypnPAuGmBc9GpeVEmEMnaWKniCT-fNcBhpFhdJmbkYb_6Dvat8uA1tBaCssi6p2o";
