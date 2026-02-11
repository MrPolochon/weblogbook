# DIAGNOSTIC BUG - Audio téléphone unidirectionnel (LiveKit)

## PROBLÈME
Seule la personne qui appelle peut transmettre la voix. L'autre personne (destinataire) entend uniquement mais ne peut pas émettre.

## CAUSE RACINE IDENTIFIÉE

### 1. **display:none empêche la lecture audio** (CRITIQUE)
Le conteneur des éléments audio a `style={{ display: 'none' }}`. 

**Comportement navigateur** : Les éléments `<audio>` dont le parent a `display: none` ne jouent pas le son. C'est documenté (Stack Overflow, MDN).

**Impact** : 
- L'appelant rejoint en second (après le polling 500ms)
- L'appelant reçoit la track audio du destinataire via TrackSubscribed
- L'élément audio est attaché au div avec display:none
- → L'appelant n'entend pas le destinataire

Le destinataire peut entendre l'appelant car il peut y avoir des différences de timing/ordre selon le navigateur.

### 2. **Pas de fallback si audioContainerRef est null**
```tsx
if (audioContainerRef.current) {
  audioContainerRef.current.appendChild(audioElement);
}
```
Si le ref est null au moment de TrackSubscribed, l'élément n'est jamais ajouté au DOM → pas de son.

### 3. **Pas de gestion des tracks déjà publiés**
Quand l'appelant rejoint, le destinataire est déjà dans la room avec son micro publié. Il faut s'assurer que les tracks existants sont bien attachés (ParticipantConnected + publication.track).

### 4. **Pas de handler TrackUnsubscribed**
Pas de nettoyage des éléments audio quand une track est désabonnée.

## FICHIERS À MODIFIER
- `src/components/AtcTelephone.tsx` (implémentation principale utilisée)
- `src/hooks/useLiveKitCall.ts` (même problème si utilisé ailleurs)
