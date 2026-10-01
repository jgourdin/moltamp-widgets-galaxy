# MOLTamp Shaders

Des shaders Shadertoy transformés en **widgets** et **visualizers** pour [MOLTamp](https://moltamp.com).
Partagés entre collègues, pour un usage **non commercial** (voir [Licences](#licences)).

## Installation

```bash
git clone <url-de-ce-repo> moltamp-shaders && cd moltamp-shaders
./install.sh          # copie widgets/ et visualizers/ dans ~/Moltamp
```

Puis redémarre MOLTamp :
- **Widgets** : Settings > Tabs, catégorie **Shaders**. Ils prennent tout l'emplacement (`sizing: fill`).
- **Visualizers** : engrenage du widget Visualizer > choisir le preset.

Testé sur MOLTamp 3.2.2, Mac Apple Silicon. Les widgets et les visualizers « GPU » demandent WebGL2.

## Ce que ça fait

- **Widgets** : le GLSL d'origine tourne dans le widget (multipasse Buffer A-D et Common gérés). La vitesse et l'intensité suivent l'état de Claude (idle, thinking, streaming, tool-use…) et l'activité du terminal.
  - Un widget n'a pas accès au son : les shaders audio y reçoivent un spectre **simulé** à partir de l'activité de Claude.
  - Réglages par widget via `moltamp.settings` : `{ scale, maxPixels, fpsCap, speed, reactive }`.
- **Visualizers « GPU »** (Spectralizer, Fractal Kaleidoscope, Psyche Skull, Sound Candy, Fractal Land) : le GLSL d'origine reçoit le vrai son du système. Les couleurs sont remappées sur la palette du skin (`USE_SKIN_PALETTE` en tête de `renderer.js`).
- **Visualizers Canvas 2D** (Synthwave Sunset, Exusiai Jump, PRTS Dance) : Canvas 2D pur, couleurs du skin, réaction aux beats.

## Limites connues

- **Clic droit** : sur un widget de cette collection, le menu d'emplacement (Add Widget / Remove this slot) ne s'ouvre pas. C'est une limite de MOLTamp pour tous les widgets utilisateur ; passe par Settings.
- **Jupiter & Io** : à placer dans un emplacement large. En portrait, le shader d'origine laisse une ligne de raccord.
- Les photos et textures des shaders d'origine sont remplacées par des textures **générées** : aucun fichier Shadertoy n'est redistribué.
- Les visualizers GPU utilisent WebGL : ils ne respectent pas la règle « Canvas 2D uniquement » du dépôt communautaire MOLTamp.

## Crédits

Chaque fichier garde en en-tête le titre, l'auteur, le lien d'origine, la licence et la liste des modifications.

| Nom | Widget | Visualizer | Shader d'origine | Auteur | Licence |
|---|---|---|---|---|---|
| Shader Runner | `shadertoy-runner` | — | démo originale | j0j0 | MIT (code) + CC0 (démo) |
| Artifakt Cubes | `st-artifakt` | — | [artifakt](https://www.shadertoy.com/view/N3KGz3) | incre_ment | CC BY-NC-SA 3.0 |
| Coral Reef | `st-coral-reef` | — | [Coral Reef Y28](https://www.shadertoy.com/view/7X3GRS) | Yusef28 | CC BY-NC-SA 3.0 |
| Exusiai Jump | `st-exusiai` | `st-exusiai` | [Exusiai Jumping](https://www.shadertoy.com/view/7XK3zc) | KaltsitComeBack | CC BY-NC-SA 3.0 |
| Fibonacci Zoom | `st-fibonacci-zoom` | — | [Extruded Fibonacci Zoom](https://www.shadertoy.com/view/sfVGDG) | Shane | CC BY-NC-SA 3.0 |
| Fractal Kaleidoscope | `st-deepseek-r1` | `st-deepseek-r1` | [DeepSeek R1 - Audio Visual](https://www.shadertoy.com/view/lXVfW3) | Patan77 | CC BY-NC-SA 3.0 |
| Fractal Land | `st-fractal-land` | `st-fractal-land` | [Fractal Land](https://www.shadertoy.com/view/XsBXWt) | Kali | CC BY-NC-SA 3.0 |
| Hex Hive Tunnel | `st-hive-lattice` | — | [Hexagonal Hive Lattice](https://www.shadertoy.com/view/73KGRd) | nobody93 | CC BY-NC-SA 3.0 |
| Infinite Hamsa | `st-infinite-hamsa` | — | [Infinite Hamsa](https://www.shadertoy.com/view/7XK3Rc) | noztol | CC BY-NC-SA 3.0 |
| Jupiter & Io | `st-jupiter-io` | — | [Jupiter and Io](https://www.shadertoy.com/view/XXjSRc) | edziewanowski | CC BY-NC-SA 3.0 |
| Liquid Warp | `st-warp-fbm` | — | [Base warp fBM](https://www.shadertoy.com/view/tdG3Rd) | trinketMage | CC BY-NC-SA 3.0 |
| Mondrian Hexagons | `st-mondrian-hexagon` | — | [Mondrian Hexagon Infinity](https://www.shadertoy.com/view/sXGGzV) | DavidBraun | MIT |
| Neon Racer | `st-wipeout` | — | [Vibe coded Shadertoy Wipeout](https://www.shadertoy.com/view/f3y3Rm) | Himred | CC BY-NC-SA 3.0 |
| Open Ocean | `st-ocean` | — | [Very fast procedural ocean](https://www.shadertoy.com/view/MdXyzX) | afl_ext | MIT |
| PRTS Dance | `st-prts-dance` | `st-prts-dance` | [普瑞赛斯的神秘前文明舞步](https://www.shadertoy.com/view/N3VGzm) | KaltsitComeBack | CC BY-NC-SA 3.0 |
| Psyche Skull | `st-skurr` | `st-skurr` | [.-=its a skurr=-.](https://www.shadertoy.com/view/Ws2Bzw) | im_paul_hi | CC BY-NC-SA 3.0 |
| Sound Candy | `st-sound-candy` | `st-sound-candy` | [Sound Candy Six](https://www.shadertoy.com/view/dlGXRD) | Pink | CC BY-NC-SA 3.0 |
| Spectralizer | `st-spectralizer` | `st-spectralizer` | [🎵🔥<<< SPECTRALIZER >>>🔥🎵](https://www.shadertoy.com/view/wXscWN) | chronos | CC BY-NC-SA 3.0 |
| Sunset Drive | `st-sunset-drive` | — | [Sunset Drive Visualizer](https://www.shadertoy.com/view/dsXyRj) | Michal Klos, TheWindowStreamz (fork) | CC BY-NC-SA 3.0 |
| Synthwave Sunset | `st-synthwave` | `st-synthwave` (recréation Canvas 2D) | [Synthwave audio removed](https://www.shadertoy.com/view/clsfRr) | axiomgraph | CC BY-NC-SA 3.0 |

Non portés : *Clouds* et *Elevated* d'Inigo Quilez, dont la licence interdit tout usage dans un projet.

## Licences

Voir [LICENSE.md](LICENSE.md) : CC BY-NC-SA 3.0 pour les ports de shaders sous licence par défaut, MIT pour Open Ocean,
Mondrian Hexagons et le code du runner. Les danses sont du fan art de personnages Arknights (propriété de Hypergryph).
