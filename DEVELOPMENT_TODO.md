# THE LAB - DEVELOPMENT TO-DO LIST & WORKFLOW

**Last Updated:** 2026-06-04  
**Current Version:** 1.0.0  
**Status:** Core systems designed, implementation in progress

---

## ⚠️ CRITICAL REMINDER: DOWNLOAD FILES AFTER EACH SESSION

**DO NOT LOSE WORK!** After every ChatGPT session:
1. ✅ **RIGHT-CLICK each .txt file ChatGPT generates → SAVE AS**
2. ✅ **Save to:** `~/Downloads/The-Lab-session-[date]/` or your preferred folder
3. ✅ **Update VERSIONS.txt** in this repo with what you did
4. ✅ **COMMIT both files** to GitHub before next session
5. ✅ **Mark checkbox below** as complete

---

## 📋 SESSION TRACKING

| Session | Date | Task | Status | Files Downloaded? | Committed? |
|---------|------|------|--------|------------------|-----------|
| 1 | 2026-06-04 | Get TO-DO list | ✅ DONE | ✅ YES | ✅ YES |
| 2 | [TBD] | Create loader.js | ⏳ PENDING | ❌ NO | ❌ NO |
| 3 | [TBD] | Complete room.js | ⏳ PENDING | ❌ NO | ❌ NO |
| 4 | [TBD] | Complete enemy.js | ⏳ PENDING | ❌ NO | ❌ NO |
| 5 | [TBD] | Create specialization.js | ⏳ PENDING | ❌ NO | ❌ NO |
| 6 | [TBD] | Combat/projectile.js | ⏳ PENDING | ❌ NO | ❌ NO |
| 7 | [TBD] | Artifact system | ⏳ PENDING | ❌ NO | ❌ NO |
| 8 | [TBD] | Consumables system | ⏳ PENDING | ❌ NO | ❌ NO |

---

## 🔴 PHASE 1: CORE SYSTEMS (Do First - ~40% complete)

**⚠️ NOTE: After ChatGPT creates EACH file, download immediately with reminder below**

### P1.1 - Loader System Implementation
- **File:** `src/js/loader.js` (MISSING - CRITICAL)
- **Task:** Create GameLoader class to load all JSON files
- **Status:** ⏳ PENDING
- **Complexity:** Medium
- **Depends on:** Nothing (this enables everything)
- **Next:** None - start here first

**ChatGPT Prompt:**
```
I'm building a roguelike game called The-Lab.

CREATE: src/js/loader.js

This file must:
1. Create a GameLoader class
2. Load these JSON files from docs/:
   - specializations.json
   - enemies.json
   - floors.json
   - artifacts.json
   - consumables.json
   - permanent_tools.json
   - shop_economy.json
   - stats_system.json
   - game_loop.json
   - asset_list.json

3. Include these methods:
   - loadAllData() - loads everything
   - getSpecialization(id) - returns spec by id
   - getEnemy(id) - returns enemy by id
   - getFloorData(floorNumber) - returns floor config
   - getArtifact(id) - returns artifact by id
   - getShopData(floor) - returns shop inventory

4. Include error handling and logging

OUTPUT: Complete src/js/loader.js file with all methods, 
error handling, and comments.
```

**Download Checklist:**
- [ ] ChatGPT output contains `loader-v1.0.0.txt` or similar
- [ ] RIGHT-CLICK → SAVE AS to `~/Downloads/The-Lab-session-1/`
- [ ] Open file, verify it has complete GameLoader class
- [ ] Copy contents into `src/js/loader.js` in your repo
- [ ] Commit: `git add src/js/loader.js && git commit -m "feat: Add game loader system v1.0.0"`
- [ ] Update VERSIONS.txt with new entry
- [ ] **BEFORE NEXT SESSION:** ✅ Mark below as DONE

**Status:** ⏳ PENDING  
✅ Downloaded? NO  
✅ Committed? NO  

---

### P1.2 - Room Generation System
- **File:** `src/js/room.js` (PARTIALLY DONE - needs expansion)
- **Task:** Implement complete room generation from floors.json
- **Status:** ⏳ PENDING (BLOCKED - waiting for P1.1)
- **Complexity:** Medium-High
- **Depends on:** P1.1 (loader)

**ChatGPT Prompt:**
```
I'm continuing The-Lab roguelike development.

TASK: Complete src/js/room.js

Current status: Partial implementation exists, needs full build.

Must handle:
1. Room generation from floors.json
2. Identify room type: normal, secret, shop, or boss
3. Generate enemy spawn points based on type
4. Draw room boundaries, obstacles, walls
5. Track which enemies are in room
6. Check if room is cleared (all enemies dead)
7. Handle room transitions

Include these methods:
- constructor(floorNumber, roomNumber, totalRooms, canvas)
- generateEnemies() - spawn enemies based on room type
- update(deltaTime, player) - update all entities
- draw(ctx) - draw room and contents
- isCleared() - check if all enemies defeated
- getReward() - return loot table entry for cleared room

OUTPUT: Complete src/js/room.js with all features,
proper integration with floors.json and enemies.json data.
```

**Download Checklist:**
- [ ] ChatGPT output contains room file
- [ ] RIGHT-CLICK → SAVE AS to `~/Downloads/The-Lab-session-2/`
- [ ] Verify file has all required methods
- [ ] Copy into `src/js/room.js`
- [ ] Commit with clear message
- [ ] Update VERSIONS.txt
- [ ] **BEFORE NEXT SESSION:** ✅ Mark below as DONE

**Status:** ⏳ PENDING (BLOCKED)  
✅ Downloaded? NO  
✅ Committed? NO  

---

### P1.3 - Enemy System Implementation
- **File:** `src/js/enemy.js` (PARTIALLY DONE - needs expansion)
- **Task:** Implement complete Enemy class with AI from enemies.json
- **Status:** ⏳ PENDING (BLOCKED - waiting for P1.1)
- **Complexity:** High
- **Depends on:** P1.1 (loader)

**ChatGPT Prompt:**
```
I'm continuing The-Lab roguelike development.

TASK: Complete src/js/enemy.js

Current status: Partial implementation exists, needs full AI and mechanics.

Must handle:
1. Enemy class that loads data from enemies.json
2. AI states: idle, chase, attack, dead
3. Movement toward player
4. Collision detection with projectiles
5. Health/damage system
6. Death animation and loot drop
7. Special abilities per enemy type
8. Boss AI patterns (unique to boss enemies)

Include these methods:
- constructor(enemyType, x, y)
- update(deltaTime, player, walls)
- draw(ctx)
- takeDamage(amount)
- die() - trigger death and loot drop
- attack() - perform attack
- getAI(player) - determine action based on state

OUTPUT: Complete src/js/enemy.js with AI system,
proper collision, stats from enemies.json data.
```

**Download Checklist:**
- [ ] ChatGPT output contains enemy file
- [ ] RIGHT-CLICK → SAVE AS to `~/Downloads/The-Lab-session-3/`
- [ ] Verify AI states are implemented
- [ ] Copy into `src/js/enemy.js`
- [ ] Commit with clear message
- [ ] Update VERSIONS.txt
- [ ] **BEFORE NEXT SESSION:** ✅ Mark below as DONE

**Status:** ⏳ PENDING (BLOCKED)  
✅ Downloaded? NO  
✅ Committed? NO  

---

### P1.4 - Player Specialization System
- **File:** `src/js/specialization.js` (NEW)
- **Task:** Implement specialization selection & mechanics
- **Status:** ⏳ PENDING (BLOCKED - waiting for P1.1)
- **Complexity:** Medium
- **Depends on:** P1.1 (loader)

**ChatGPT Prompt:**
```
I'm continuing The-Lab roguelike development.

CREATE: src/js/specialization.js

This system handles player specialization mechanics.

Must include:
1. Specialization class
2. Equip/unequip specializations
3. Apply stat modifiers (damage, speed, health, etc)
4. Track active specializations (can have up to 2)
5. Handle specialization combinations
6. Projectile effect changes based on spec
7. Unlock specializations as player progresses

Methods needed:
- constructor(specId) 
- equip() - apply stat modifiers to player
- unequip() - remove modifiers
- getProjectileType() - what projectile this spec fires
- getCombinationEffect(otherSpec) - get combo effect
- getStatModifiers() - return all stat changes

Integration:
- Load specialization data from specializations.json
- Work with player.js to modify stats
- Enable combo system (2 specs = special effect)

OUTPUT: Complete src/js/specialization.js with all mechanics
and integration points clearly marked.
```

**Download Checklist:**
- [ ] ChatGPT output contains specialization file
- [ ] RIGHT-CLICK → SAVE AS to `~/Downloads/The-Lab-session-4/`
- [ ] Verify combination system logic
- [ ] Copy into `src/js/specialization.js`
- [ ] Commit with clear message
- [ ] Update VERSIONS.txt
- [ ] **BEFORE NEXT SESSION:** ✅ Mark below as DONE

**Status:** ⏳ PENDING (BLOCKED)  
✅ Downloaded? NO  
✅ Committed? NO  

---

## 🟠 PHASE 2: PLAYER MECHANICS (Depends on Phase 1)

### P2.1 - Combat System
- **File:** `src/js/projectile.js` (separate file) + update `src/js/player.js`
- **Task:** Implement projectiles with specialization effects
- **Status:** ⏳ PENDING (BLOCKED - waiting for P1.1, P1.4)
- **Complexity:** High

**Download Checklist:**
- [ ] Downloaded from ChatGPT? NO
- [ ] Committed to repo? NO

**Status:** ⏳ PENDING (BLOCKED)  

---

### P2.2 - Artifact/Equipment System
- **File:** `src/js/artifact.js` (NEW)
- **Task:** Implement artifact equipping and stat modifications
- **Status:** ⏳ PENDING (BLOCKED)
- **Complexity:** Medium

**Download Checklist:**
- [ ] Downloaded from ChatGPT? NO
- [ ] Committed to repo? NO

**Status:** ⏳ PENDING (BLOCKED)  

---

### P2.3 - Consumable Tools System
- **File:** `src/js/consumables.js` (NEW)
- **Task:** Implement match/rope/blowtorch/breaker bar usage
- **Status:** ⏳ PENDING (BLOCKED)
- **Complexity:** Medium

**Download Checklist:**
- [ ] Downloaded from ChatGPT? NO
- [ ] Committed to repo? NO

**Status:** ⏳ PENDING (BLOCKED)  

---

### P2.4 - Permanent Tools System
- **File:** `src/js/permanent_tools.js` (NEW)
- **Task:** Implement legendary tools with limited uses
- **Status:** ⏳ PENDING (BLOCKED)
- **Complexity:** Medium-High

**Download Checklist:**
- [ ] Downloaded from ChatGPT? NO
- [ ] Committed to repo? NO

**Status:** ⏳ PENDING (BLOCKED)  

---

## 🟡 PHASE 3: GAME SYSTEMS (Depends on Phase 1-2)

### P3.1 - Loot & Drop System
- **File:** `src/js/loot.js` (NEW)
- **Status:** ⏳ PENDING (BLOCKED)

**Download Checklist:**
- [ ] Downloaded? NO
- [ ] Committed? NO

---

### P3.2 - Shop System
- **File:** `src/js/shop.js` (NEW)
- **Status:** ⏳ PENDING (BLOCKED)

**Download Checklist:**
- [ ] Downloaded? NO
- [ ] Committed? NO

---

### P3.3 - Key & Door System
- **File:** `src/js/keys.js` (NEW)
- **Status:** ⏳ PENDING (BLOCKED)

**Download Checklist:**
- [ ] Downloaded? NO
- [ ] Committed? NO

---

### P3.4 - Floor Progression System
- **File:** `src/js/progression.js` (NEW)
- **Status:** ⏳ PENDING (BLOCKED)

**Download Checklist:**
- [ ] Downloaded? NO
- [ ] Committed? NO

---

### P3.5 - Stats & Balance System
- **File:** `src/js/balance.js` (NEW)
- **Status:** ⏳ PENDING (BLOCKED)

**Download Checklist:**
- [ ] Downloaded? NO
- [ ] Committed? NO

---

## 🟢 PHASE 4: UI & VISUAL POLISH

### P4.1 - HUD System
- **File:** Update `src/js/ui.js`
- **Status:** ⏳ PENDING (BLOCKED)

**Download Checklist:**
- [ ] Downloaded? NO
- [ ] Committed? NO

---

### P4.2 - Codex System
- **File:** `src/js/codex.js` (NEW)
- **Status:** ⏳ PENDING (BLOCKED)

**Download Checklist:**
- [ ] Downloaded? NO
- [ ] Committed? NO

---

### P4.3 - Main Menu & Settings
- **File:** `src/js/settings.js` (NEW)
- **Status:** ⏳ PENDING (BLOCKED)

**Download Checklist:**
- [ ] Downloaded? NO
- [ ] Committed? NO

---

### P4.4 - Visual Assets
- **File:** `src/assets/` directory
- **Status:** ⏳ PENDING (BLOCKED)

**Download Checklist:**
- [ ] Downloaded? NO
- [ ] Committed? NO

---

### P4.5 - Particle Effects & Polish
- **File:** `src/js/particles.js` (NEW)
- **Status:** ⏳ PENDING (BLOCKED)

**Download Checklist:**
- [ ] Downloaded? NO
- [ ] Committed? NO

---

### P4.6 - Sound System
- **File:** `src/js/audio.js` (NEW)
- **Status:** ⏳ PENDING (BLOCKED)

**Download Checklist:**
- [ ] Downloaded? NO
- [ ] Committed? NO

---

## 📁 FILES TO CREATE - QUICK CHECKLIST

```
🔴 CRITICAL (Do first):
☐ src/js/loader.js              ← Session 2
☐ src/js/room.js (complete)     ← Session 3
☐ src/js/enemy.js (complete)    ← Session 4
☐ src/js/specialization.js      ← Session 5

🟠 HIGH (Core gameplay):
☐ src/js/projectile.js          ← Session 6
☐ src/js/artifact.js            ← Session 7
☐ src/js/consumables.js         ← Session 8
☐ src/js/permanent_tools.js     ← Session 9
☐ src/js/loot.js                ← Session 10
☐ src/js/shop.js                ← Session 11
☐ src/js/keys.js                ← Session 12
☐ src/js/progression.js         ← Session 13
☐ src/js/balance.js             ← Session 14

🟡 MEDIUM (Polish):
☐ src/js/codex.js               ← Session 15
☐ src/js/settings.js            ← Session 16
☐ src/js/particles.js           ← Session 17
☐ src/js/audio.js               ← Session 18
```

---

## 🎯 NEXT IMMEDIATE STEPS

**RIGHT NOW:**
1. ✅ You have this TO-DO list
2. ✅ Review it and update any notes

**NEXT SESSION (Session 2):**
1. Go to ChatGPT
2. **Copy the P1.1 prompt** from above exactly
3. Wait for output
4. **⚠️ IMMEDIATELY:** RIGHT-CLICK the .txt file → **SAVE AS**
5. Save to folder: `~/Downloads/The-Lab-Session-2/`
6. Copy contents into `src/js/loader.js` in your repo
7. Test that it loads (check browser console)
8. Commit to GitHub
9. Update VERSIONS.txt with:
   ```
   Version 1.0.1 (2026-06-XX)
   - Added: src/js/loader.js
   - Status: Loader system complete
   - Next: Room generation system
   ```
10. **Come back here** and mark P1.1 as ✅ DONE

---

## 📝 VERSION TRACKING

**Current:** v1.0.0 (Project Started)

Track all new versions in `VERSIONS.txt`:

```
v1.0.0 (2026-06-04) - Project initialized
- Specs: All 34 specializations locked
- Consumables: All designed
- Tools: Permanent tools designed
- Floors: Architecture complete (5 floors, 13 rooms each)
- Enemies: Full list (25+ types with AI templates)
- Artifacts: 20+ artifacts with rarity tiers
- Shop: Economy designed with floor scaling
- Status: Design phase complete, implementation starting

v1.0.1 (TBD) - Loader System
- Added: src/js/loader.js
- Loads: All JSON data files
- Status: System ready, room generation next

v1.0.2 (TBD) - Room Generation
- Added: Complete src/js/room.js
- Features: Room types, enemy spawning, layout
- Status: Rooms generating, enemy AI next

[Continue as you complete phases...]
```

---

## ⚡ QUICK REFERENCE: HOW NOT TO LOSE WORK

**GOLDEN RULE:** Every ChatGPT session = One or more downloaded .txt files

| ❌ DON'T | ✅ DO |
|---------|------|
| Copy code directly in chat | Download the .txt file first |
| Trust browser to keep window open | Save to computer immediately |
| Skip updating VERSIONS.txt | Update it EVERY session |
| Forget to commit | Commit after every download |
| Work across multiple sessions without saving | Save → Commit after each session |
| Assume files are auto-synced | Manual save + commit = safety |

**Each Session Follow This Flow:**
```
1. Ask ChatGPT to create/update file
   ↓
2. ⚠️ RIGHT-CLICK → SAVE AS (to Downloads folder)
   ↓
3. Open file, verify code is correct
   ↓
4. Copy to appropriate location in repo
   ↓
5. Test if possible (check console/functionality)
   ↓
6. Git commit (git add + git commit)
   ↓
7. Update VERSIONS.txt
   ↓
8. Commit VERSIONS.txt changes
   ↓
9. Come back here, mark task ✅ DONE
```

---

## 📌 LAST REMINDER

**Don't lose your work!** After every ChatGPT session:
- 💾 Download the file(s)
- 📝 Update VERSIONS.txt
- 📤 Commit to GitHub
- ✅ Mark completed in this list

Then your code is safe and trackable forever! 🎉
