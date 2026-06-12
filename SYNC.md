# ☁️ Activer la synchronisation multi-appareils

Sans la sync, la progression est sauvegardée **dans le navigateur de chaque appareil**
(Canner héberge seulement les fichiers de l'app — il ne stocke aucune donnée).
Avec la sync, les enfants retrouvent leur progression partout : tablette, téléphone, ordi.

## Étapes (~5 minutes, gratuit)

1. Crée un compte sur [supabase.com](https://supabase.com) → **New project**
   (choisis n'importe quel nom, ex. `livre-de-quetes`, et une région proche, ex. `ca-central-1`).

2. Dans le projet : menu **SQL Editor** → colle et exécute ceci :

   ```sql
   create table familles (
     id text primary key,
     data jsonb,
     saved_at timestamptz
   );
   alter table familles enable row level security;
   create policy "famille_ouverte" on familles
     for all using (true) with check (true);
   ```

3. Menu **Settings → API** : copie deux valeurs :
   - **Project URL** (ex. `https://abcdefgh.supabase.co`)
   - **anon public key** (longue chaîne `eyJ...`)

4. Dans `src/App.jsx`, près du haut du fichier, remplis :

   ```js
   const SYNC_URL = "https://abcdefgh.supabase.co";
   const SYNC_KEY = "eyJ...";
   const FAMILY_ID = "choisis-une-phrase-unique-difficile-a-deviner";
   ```

   ⚠️ Le `FAMILY_ID` agit comme mot de passe de vos données : mets quelque chose
   d'original (pas « famille » tout court).

5. Pousse sur GitHub → Canner redéploie → ouvre l'app sur chaque appareil.
   Le premier appareil qui ouvre l'app envoie sa sauvegarde au nuage; les autres la récupèrent.

## Comment ça marche

- Chaque action (tâche, XP, achat…) est sauvegardée localement **et** poussée au nuage (délai ~1,5 s).
- Chaque appareil vérifie le nuage toutes les 25 secondes et au retour sur l'app.
- En cas de panne réseau, l'app continue en local sans rien perdre.
- Limite connue : si deux appareils modifient en même temps à la seconde près,
  la dernière sauvegarde gagne. Pour une famille, c'est très rarement un problème.

## Note de sécurité

La clé `anon` est visible dans le code de l'app — c'est prévu ainsi par Supabase.
La protection réelle de vos données est le `FAMILY_ID` : garde-le original et privé.
Les données stockées sont uniquement la progression du jeu (aucun vrai nom requis si
les pseudos sont utilisés, aucun courriel, aucun mot de passe).

Si tu préfères, demande à Claude de faire ces étapes avec toi.
