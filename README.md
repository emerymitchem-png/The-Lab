# The-Lab

A roguelite dungeon crawler where you combine science specializations to fight your way through 5 biome floors. Each specialization changes how you attack and what effects you deal. Discover new specializations as you progress, combine them for powerful synergies, and unlock permanent tools.

## Game Structure

- **5 Floors** (Lab → Geosphere → Hydrosphere → Atmosphere → Biosphere)
- **Scaled floor sizes (11→13→14→14→13 rooms)** (normal rooms, secret rooms, marked doors, shop, boss)
- **34 Science Specializations** (unlock as you progress through floors)
- **Combination System** (mix specializations for new projectiles and debuffs)
- **Consumable Tools** (Match, Rope, Blowtorch, Breaker Bar)
- **Permanent Tools** (Grappling Hook, Fire Extinguisher, Magnifying Glass, Drill, Plasma Cutter)
- **Artifact System** (equip artifacts to modify stats and abilities)
- **Key System** (find universal keys to unlock shops and mystery rooms)

## Core Systems

- `specializations.json` - All 34 specializations, projectiles, debuffs, combinations
- `consumables.json` - Match, Rope, Blowtorch, Breaker Bar mechanics
- `permanent_tools.json` - Legendary tools with limited uses
- `floors.json` - 5 floor architectures and room distribution
- `loot_tables.json` - Drop rates and chest contents
- `artifacts.json` - Artifact system (TBD from yesterday)
- `shop_economy.json` - Pricing and inventory per floor

## Development Status

- ✅ Specializations locked
- ✅ Consumables designed
- ✅ Permanent tools designed
- ✅ Floor architecture designed
- ⏳ Artifacts (restore from yesterday's work)
- ⏳ Stats system (speed, damage, health)
- ⏳ Enemy design
- ⏳ Visual design
