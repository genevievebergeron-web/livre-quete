# ☁️ Synchronisation multi-appareils

Sans la sync, la progression est sauvegardée **dans le navigateur de chaque appareil**
(Canner héberge l'app, mais ne stocke pas les données toute seule).
Avec la sync, les enfants retrouvent leur progression partout — tablette, téléphone, ordi —
et tu peux valider leurs tâches de ton propre téléphone.

## ✅ Option 1 (recommandée) : Postgres de Canner

Canner fournit une base Postgres isolée par projet, injectée via `DATABASE_URL`.
Tout reste au Québec (Loi 25), aucun compte supplémentaire. L'app contient déjà :

- `server.cjs` — petit serveur Node qui sert l'app **et** l'API `/api/famille`
- la détection automatique côté client : si l'API répond, la sync s'active toute seule

### Étapes

1. Pousse ce commit sur GitHub (Canner redéploie).
2. Dans le tableau de bord Canner → ton projet → vérifie que la base **Postgres**
   est activée (elle injecte `DATABASE_URL` automatiquement au build).
3. Vérifie que le projet roule bien en mode **Node** (commande `npm start`) et non
   en site statique. Si la page `https://<ton-projet>.app.canner.ca/api/sante`
   affiche `{"ok":true,"stockage":"postgres"}` → la sync est active. 🎉
   - Si tu vois du HTML à la place : le projet est encore servi en statique —
     écris au support Canner (support@canner.ca) ou vérifie la détection du
     framework dans les réglages du projet.
4. Ouvre l'app sur chaque appareil : le premier envoie sa sauvegarde, les autres la reçoivent.

> ⚠️ Forfait Starter (gratuit) : l'app « s'endort » après quelques heures sans visite
> et met 1 à 4 secondes à se réveiller à la première ouverture. Normal.

### Choisir le `FAMILY_ID`

Dans `src/App.jsx` (haut du fichier), la constante `FAMILY_ID` identifie vos données —
elle agit comme un mot de passe. Mets une phrase originale difficile à deviner.

## Option 2 (rechange) : Supabase

Si jamais le mode Node ne fonctionne pas chez Canner, l'app supporte aussi Supabase :

1. Compte gratuit sur supabase.com → New project.
2. SQL Editor → exécuter :

   ```sql
   create table familles (id text primary key, data jsonb, saved_at timestamptz);
   alter table familles enable row level security;
   create policy "famille_ouverte" on familles for all using (true) with check (true);
   ```

3. Settings → API : copier **Project URL** et **anon public key** dans
   `SYNC_URL` et `SYNC_KEY` en haut de `src/App.jsx`, puis pousser.

## Comment ça marche (les deux modes)

- Chaque action (tâche, XP, achat…) est sauvegardée localement **et** poussée au nuage (~1,5 s).
- Chaque appareil vérifie le nuage toutes les 25 secondes et au retour sur l'app.
- Panne de réseau? L'app continue en local, rien n'est perdu.
- Limite : si deux appareils modifient à la même seconde, la dernière sauvegarde gagne
  (le serveur refuse d'écraser du plus récent par du plus ancien).
- Données stockées : uniquement la progression du jeu — pseudos, XP, badges. Pas de courriels ni mots de passe.
