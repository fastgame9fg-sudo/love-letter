# Love Letter

Jeu de cartes Love Letter jouable dans le navigateur — 3 modes (Classique, Classique étendu, Premium), 2 à 6 joueurs, solo contre bots, pass & play local ou **multijoueur en ligne** via WebRTC (PeerJS).

## Jouer

Ouvre `index.html` dans un navigateur moderne. Aucune installation nécessaire.

Ou, pour un petit serveur local :

```bash
npx serve -l 5173 .
```

## Modes

- **Classique** — 16 cartes, 2-4 joueurs (règles officielles 2012)
- **Classique étendu** — 24 cartes, 2-6 joueurs (deck doublé)
- **Premium** — 32 cartes, 2-6 joueurs (cartes additionnelles : Bouffon, Assassin, Cardinal, Baronne, Courtisan, Comte, Connétable, Reine-mère, Évêque)

## En ligne

Un joueur clique *Créer la salle*, obtient un code à 4 lettres, le partage avec ses amis. Les autres cliquent *Rejoindre* et entrent le code. WebRTC peer-to-peer via le broker public PeerJS — pas de serveur à héberger.

## Structure

- `index.html` — page principale
- `css/style.css` — tous les styles
- `js/cards.js` — définitions des cartes, decks des 3 modes, PRNG seedé
- `js/game.js` — moteur (tours, effets, conditions de victoire)
- `js/ai.js` — bots
- `js/ui.js` — DOM + interactions
- `js/online.js` — primitives PeerJS
- `js/online-controller.js` — contrôleurs host/guest
- `js/main.js` — point d'entrée
