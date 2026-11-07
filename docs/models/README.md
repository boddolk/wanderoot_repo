# Вихідні файли діаграм WandeRoot

Діаграми зберігаються як текст: їх можна відкрити, змінити й перегенерувати.

| Файл | Рисунок у записці | Інструмент |
|---|---|---|
| usecase_tobe.dot (+ actor.png) | 1.1 Діаграма варіантів використання | Graphviz (neato) |
| components.dot | 1.2 Діаграма компонентів | Graphviz (dot) |
| deployment.dot | 1.3 Діаграма розгортання | Graphviz (dot) |
| class_domain.mmd | 1.4 Діаграма класів предметної області | Mermaid |
| pattern_strategy.mmd | 1.5 Патерн «Стратегія» | Mermaid |
| state_route.dot | 1.6 Діаграма станів маршруту | Graphviz (dot) |
| seq_comment.mmd | 1.7 Послідовність «Коментування маршруту» | Mermaid |
| seq_import.mmd | Б.1 Послідовність «Імпорт маршруту» | Mermaid |
| activity_moderation.dot | Б.2 Діаграма діяльності «Розгляд скарги» | Graphviz (dot) |

## Як редагувати без встановлення програм
- **Mermaid (.mmd):** вставити вміст у https://mermaid.live — праворуч одразу видно результат, експорт у PNG/SVG.
  Також draw.io: *Arrange → Insert → Advanced → Mermaid* (вставляє діаграму у draw.io).
- **Graphviz (.dot):** вставити вміст у https://dreampuf.github.io/GraphvizOnline (для usecase_tobe.dot обрати рушій `neato`).
  У діаграмі варіантів використання позиції елементів задано вручну атрибутом `pos="x,y!"` (у дюймах).

## Як перегенерувати локально
```bash
# Graphviz
dot   -Tpng -Gdpi=150 components.dot   -o components.png
neato -Tpng -Gdpi=150 usecase_tobe.dot -o usecase_tobe.png
# Mermaid CLI (npm i -g @mermaid-js/mermaid-cli)
mmdc -i class_domain.mmd -o class_domain.png -c mermaid.json -s 2 -b white
```
`mermaid.json` — налаштування шрифтів і відступів, з якими зроблено рисунки в записці.
