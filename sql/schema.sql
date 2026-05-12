-- =============================================
-- Umbra Online Database Schema
-- Version: 1.0
-- =============================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================
-- USERS & AUTHENTICATION
-- =============================================

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `last_login` TIMESTAMP NULL,
    `is_banned` TINYINT(1) DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_username` (`username`),
    UNIQUE KEY `uk_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- CHARACTER TABLES
-- =============================================

DROP TABLE IF EXISTS `characters`;
CREATE TABLE `characters` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(12) NOT NULL,
    `sprite_id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `country` VARCHAR(50) DEFAULT NULL,
    `city` VARCHAR(50) DEFAULT NULL,
    `level` INT UNSIGNED DEFAULT 1,
    `experience` BIGINT UNSIGNED DEFAULT 0,
    `gold` BIGINT UNSIGNED DEFAULT 0,
    `prestige` INT UNSIGNED DEFAULT 0,
    `stat_points` INT UNSIGNED DEFAULT 3,
    `skill_points` INT UNSIGNED DEFAULT 0,
    `current_hp` INT UNSIGNED DEFAULT 50,
    `current_stamina` INT UNSIGNED DEFAULT 50,
    `guild_id` INT UNSIGNED NULL,
    `last_respec` TIMESTAMP NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user` (`user_id`),
    UNIQUE KEY `uk_name` (`name`),
    KEY `idx_level` (`level`),
    KEY `idx_prestige` (`prestige`),
    KEY `idx_country` (`country`),
    CONSTRAINT `fk_char_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `character_base_stats`;
CREATE TABLE `character_base_stats` (
    `character_id` INT UNSIGNED NOT NULL,
    `str` INT UNSIGNED DEFAULT 1,
    `agi` INT UNSIGNED DEFAULT 1,
    `dex` INT UNSIGNED DEFAULT 1,
    `vit` INT UNSIGNED DEFAULT 1,
    `end_stat` INT UNSIGNED DEFAULT 1,
    `int_stat` INT UNSIGNED DEFAULT 1,
    `def` INT UNSIGNED DEFAULT 1,
    PRIMARY KEY (`character_id`),
    CONSTRAINT `fk_base_stats_char` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `character_training_stats`;
CREATE TABLE `character_training_stats` (
    `character_id` INT UNSIGNED NOT NULL,
    `str` INT UNSIGNED DEFAULT 0,
    `agi` INT UNSIGNED DEFAULT 0,
    `dex` INT UNSIGNED DEFAULT 0,
    `vit` INT UNSIGNED DEFAULT 0,
    `end_stat` INT UNSIGNED DEFAULT 0,
    `int_stat` INT UNSIGNED DEFAULT 0,
    `def` INT UNSIGNED DEFAULT 0,
    PRIMARY KEY (`character_id`),
    CONSTRAINT `fk_train_stats_char` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `character_training`;
CREATE TABLE `character_training` (
    `character_id` INT UNSIGNED NOT NULL,
    `training_type` ENUM('str','agi','dex','vit','end','int','def') NULL,
    `started_at` TIMESTAMP NULL,
    `duration_seconds` INT UNSIGNED DEFAULT 0,
    `progress_seconds` INT UNSIGNED DEFAULT 0,
    `camp_level` TINYINT UNSIGNED DEFAULT 0,
    PRIMARY KEY (`character_id`),
    CONSTRAINT `fk_training_char` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- ITEMS
-- =============================================

DROP TABLE IF EXISTS `items`;
CREATE TABLE `items` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT,
    `type` ENUM('equipment','food','loot') NOT NULL,
    `slot` ENUM('headgear','amulet','backpack','weapon1','weapon2','chest','ring','pants','boots') NULL,
    `weapon_type` ENUM('1-handed','2-handed','off-hand') NULL,
    `rarity` ENUM('normal','uncommon','rare','epic','legendary') DEFAULT 'normal',
    `bonus_str` INT DEFAULT 0,
    `bonus_agi` INT DEFAULT 0,
    `bonus_dex` INT DEFAULT 0,
    `bonus_vit` INT DEFAULT 0,
    `bonus_end` INT DEFAULT 0,
    `bonus_int` INT DEFAULT 0,
    `bonus_def` INT DEFAULT 0,
    `bonus_wdef` INT DEFAULT 0,
    `bonus_slots` INT DEFAULT 0,
    `heal_amount` INT DEFAULT 0,
    `buy_value` INT UNSIGNED DEFAULT 0,
    `sell_value` INT UNSIGNED DEFAULT 0,
    `sprite` VARCHAR(100) DEFAULT NULL,
    `level_requirement` INT UNSIGNED DEFAULT 1,
    `stackable` TINYINT(1) DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_type` (`type`),
    KEY `idx_slot` (`slot`),
    KEY `idx_rarity` (`rarity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- INVENTORY & EQUIPMENT
-- =============================================

DROP TABLE IF EXISTS `character_inventory`;
CREATE TABLE `character_inventory` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `character_id` INT UNSIGNED NOT NULL,
    `item_id` INT UNSIGNED NOT NULL,
    `quantity` INT UNSIGNED DEFAULT 1,
    `slot_position` INT UNSIGNED NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_char_slot` (`character_id`, `slot_position`),
    KEY `idx_char` (`character_id`),
    CONSTRAINT `fk_inv_char` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_inv_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `character_equipment`;
CREATE TABLE `character_equipment` (
    `character_id` INT UNSIGNED NOT NULL,
    `slot` ENUM('headgear','amulet','backpack','weapon1','weapon2','chest','ring1','ring2','pants','boots') NOT NULL,
    `item_id` INT UNSIGNED NOT NULL,
    PRIMARY KEY (`character_id`, `slot`),
    CONSTRAINT `fk_equip_char` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_equip_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- SKILLS
-- =============================================

DROP TABLE IF EXISTS `skills`;
CREATE TABLE `skills` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `tree` ENUM('swordsmanship','defense','vitality','roguery','magic','windmaster','shadow','arcane') NOT NULL,
    `type` ENUM('active','passive') NOT NULL,
    `description_template` TEXT,
    `stamina_cost` INT UNSIGNED DEFAULT 0,
    `cooldown_seconds` DECIMAL(5,2) DEFAULT 0,
    `initial_cooldown` DECIMAL(5,2) DEFAULT 0,
    `value1_base` DECIMAL(10,2) DEFAULT 0,
    `value1_per_level` DECIMAL(10,2) DEFAULT 0,
    `value2_base` DECIMAL(10,2) DEFAULT 0,
    `value2_per_level` DECIMAL(10,2) DEFAULT 0,
    `unlock_level` INT UNSIGNED DEFAULT 3,
    `sprite` VARCHAR(100) DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_tree` (`tree`),
    KEY `idx_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `character_skills`;
CREATE TABLE `character_skills` (
    `character_id` INT UNSIGNED NOT NULL,
    `skill_id` INT UNSIGNED NOT NULL,
    `level` TINYINT UNSIGNED DEFAULT 1,
    PRIMARY KEY (`character_id`, `skill_id`),
    CONSTRAINT `fk_charskill_char` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_charskill_skill` FOREIGN KEY (`skill_id`) REFERENCES `skills` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `character_skill_slots`;
CREATE TABLE `character_skill_slots` (
    `character_id` INT UNSIGNED NOT NULL,
    `slot_number` TINYINT UNSIGNED NOT NULL,
    `skill_id` INT UNSIGNED NOT NULL,
    PRIMARY KEY (`character_id`, `slot_number`),
    CONSTRAINT `fk_skillslot_char` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_skillslot_skill` FOREIGN KEY (`skill_id`) REFERENCES `skills` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- ZONES & MOBS
-- =============================================

DROP TABLE IF EXISTS `zones`;
CREATE TABLE `zones` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `min_level` INT UNSIGNED DEFAULT 1,
    `map_data` JSON,
    `map_width` INT UNSIGNED DEFAULT 30,
    `map_height` INT UNSIGNED DEFAULT 30,
    `background_image` VARCHAR(100) DEFAULT NULL,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `mobs`;
CREATE TABLE `mobs` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `hp` INT UNSIGNED NOT NULL,
    `str` INT UNSIGNED DEFAULT 1,
    `agi` INT UNSIGNED DEFAULT 1,
    `dex` INT UNSIGNED DEFAULT 1,
    `def` INT UNSIGNED DEFAULT 1,
    `int_stat` INT UNSIGNED DEFAULT 1,
    `attacks_per_second` DECIMAL(3,2) DEFAULT 1.00,
    `exp_reward` INT UNSIGNED NOT NULL,
    `gold_min` INT UNSIGNED DEFAULT 0,
    `gold_max` INT UNSIGNED DEFAULT 0,
    `sprite` VARCHAR(100) DEFAULT NULL,
    `wander_rate` DECIMAL(3,2) DEFAULT 0.50,
    `aggro_range` INT UNSIGNED DEFAULT 0,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `zone_mobs`;
CREATE TABLE `zone_mobs` (
    `zone_id` INT UNSIGNED NOT NULL,
    `mob_id` INT UNSIGNED NOT NULL,
    `spawn_count` INT UNSIGNED DEFAULT 5,
    PRIMARY KEY (`zone_id`, `mob_id`),
    CONSTRAINT `fk_zonemob_zone` FOREIGN KEY (`zone_id`) REFERENCES `zones` (`id`),
    CONSTRAINT `fk_zonemob_mob` FOREIGN KEY (`mob_id`) REFERENCES `mobs` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `mob_drops`;
CREATE TABLE `mob_drops` (
    `mob_id` INT UNSIGNED NOT NULL,
    `item_id` INT UNSIGNED NOT NULL,
    `drop_chance` DECIMAL(6,4) NOT NULL,
    `quantity_min` INT UNSIGNED DEFAULT 1,
    `quantity_max` INT UNSIGNED DEFAULT 1,
    PRIMARY KEY (`mob_id`, `item_id`),
    CONSTRAINT `fk_mobdrop_mob` FOREIGN KEY (`mob_id`) REFERENCES `mobs` (`id`),
    CONSTRAINT `fk_mobdrop_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- BOSSES
-- =============================================

DROP TABLE IF EXISTS `bosses`;
CREATE TABLE `bosses` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `min_level` INT UNSIGNED DEFAULT 5,
    `hp` INT UNSIGNED NOT NULL,
    `str` INT UNSIGNED DEFAULT 10,
    `agi` INT UNSIGNED DEFAULT 10,
    `dex` INT UNSIGNED DEFAULT 10,
    `def` INT UNSIGNED DEFAULT 10,
    `int_stat` INT UNSIGNED DEFAULT 10,
    `attacks_per_second` DECIMAL(3,2) DEFAULT 1.00,
    `exp_reward` INT UNSIGNED NOT NULL,
    `gold_min` INT UNSIGNED DEFAULT 100,
    `gold_max` INT UNSIGNED DEFAULT 500,
    `sprite` VARCHAR(100) DEFAULT NULL,
    `current_hp` INT UNSIGNED NULL,
    `defeats_until_respawn` INT UNSIGNED DEFAULT 10,
    `current_defeats` INT UNSIGNED DEFAULT 0,
    `respawn_at` TIMESTAMP NULL,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `boss_skills`;
CREATE TABLE `boss_skills` (
    `boss_id` INT UNSIGNED NOT NULL,
    `skill_id` INT UNSIGNED NOT NULL,
    PRIMARY KEY (`boss_id`, `skill_id`),
    CONSTRAINT `fk_bossskill_boss` FOREIGN KEY (`boss_id`) REFERENCES `bosses` (`id`),
    CONSTRAINT `fk_bossskill_skill` FOREIGN KEY (`skill_id`) REFERENCES `skills` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `boss_drops`;
CREATE TABLE `boss_drops` (
    `boss_id` INT UNSIGNED NOT NULL,
    `item_id` INT UNSIGNED NOT NULL,
    `drop_chance` DECIMAL(6,4) NOT NULL,
    `quantity_min` INT UNSIGNED DEFAULT 1,
    `quantity_max` INT UNSIGNED DEFAULT 1,
    PRIMARY KEY (`boss_id`, `item_id`),
    CONSTRAINT `fk_bossdrop_boss` FOREIGN KEY (`boss_id`) REFERENCES `bosses` (`id`),
    CONSTRAINT `fk_bossdrop_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- GUILDS
-- =============================================

DROP TABLE IF EXISTS `guilds`;
CREATE TABLE `guilds` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(50) NOT NULL,
    `color` VARCHAR(7) DEFAULT '#ffffff',
    `treasury` BIGINT UNSIGNED DEFAULT 0,
    `leader_id` INT UNSIGNED NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_name` (`name`),
    CONSTRAINT `fk_guild_leader` FOREIGN KEY (`leader_id`) REFERENCES `characters` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add guild FK to characters after guilds table exists
ALTER TABLE `characters` ADD CONSTRAINT `fk_char_guild` FOREIGN KEY (`guild_id`) REFERENCES `guilds` (`id`) ON DELETE SET NULL;

-- =============================================
-- CASTLES
-- =============================================

DROP TABLE IF EXISTS `castles`;
CREATE TABLE `castles` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `owner_id` INT UNSIGNED NULL,
    `gold_per_hour` INT UNSIGNED DEFAULT 100,
    `prestige_per_hour` INT UNSIGNED DEFAULT 10,
    `last_income_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    CONSTRAINT `fk_castle_owner` FOREIGN KEY (`owner_id`) REFERENCES `characters` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- MARKET / BAZAR
-- =============================================

DROP TABLE IF EXISTS `bazar_listings`;
CREATE TABLE `bazar_listings` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `seller_id` INT UNSIGNED NOT NULL,
    `item_id` INT UNSIGNED NOT NULL,
    `quantity` INT UNSIGNED DEFAULT 1,
    `price` BIGINT UNSIGNED NOT NULL,
    `listed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_seller` (`seller_id`),
    KEY `idx_item` (`item_id`),
    KEY `idx_price` (`price`),
    CONSTRAINT `fk_bazar_seller` FOREIGN KEY (`seller_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_bazar_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- MISSIONS & PROFESSIONS
-- =============================================

DROP TABLE IF EXISTS `character_missions`;
CREATE TABLE `character_missions` (
    `character_id` INT UNSIGNED NOT NULL,
    `mission_type` ENUM('contract','woodcutting','mining') NULL,
    `started_at` TIMESTAMP NULL,
    `duration_seconds` INT UNSIGNED DEFAULT 0,
    PRIMARY KEY (`character_id`),
    CONSTRAINT `fk_mission_char` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `character_professions`;
CREATE TABLE `character_professions` (
    `character_id` INT UNSIGNED NOT NULL,
    `profession` ENUM('woodcutting','mining','contract') NOT NULL,
    `level` INT UNSIGNED DEFAULT 0,
    PRIMARY KEY (`character_id`, `profession`),
    CONSTRAINT `fk_prof_char` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- QUESTS
-- =============================================

DROP TABLE IF EXISTS `character_quests`;
CREATE TABLE `character_quests` (
    `character_id` INT UNSIGNED NOT NULL,
    `current_quest` INT UNSIGNED DEFAULT 1,
    `progress` INT UNSIGNED DEFAULT 0,
    PRIMARY KEY (`character_id`),
    CONSTRAINT `fk_quest_char` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `quests`;
CREATE TABLE `quests` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `objective_type` ENUM('kill_mob','use_item','complete_mission','craft_item','buy_item','equip_skill','complete_training','kill_player','kill_boss') NOT NULL,
    `objective_target` INT UNSIGNED DEFAULT NULL,
    `objective_count` INT UNSIGNED DEFAULT 1,
    `gold_reward` INT UNSIGNED DEFAULT 0,
    `exp_reward` INT UNSIGNED DEFAULT 0,
    `item_reward_id` INT UNSIGNED NULL,
    `description` VARCHAR(255) DEFAULT NULL,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- PLAYER POSITIONS (for shadows/multiplayer feel)
-- =============================================

DROP TABLE IF EXISTS `player_positions`;
CREATE TABLE `player_positions` (
    `character_id` INT UNSIGNED NOT NULL,
    `zone_id` INT UNSIGNED NOT NULL,
    `tile_x` INT UNSIGNED NOT NULL,
    `tile_y` INT UNSIGNED NOT NULL,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`character_id`),
    KEY `idx_zone` (`zone_id`),
    KEY `idx_updated` (`updated_at`),
    CONSTRAINT `fk_pos_char` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_pos_zone` FOREIGN KEY (`zone_id`) REFERENCES `zones` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- PVP TRACKING
-- =============================================

DROP TABLE IF EXISTS `pvp_opponents`;
CREATE TABLE `pvp_opponents` (
    `character_id` INT UNSIGNED NOT NULL,
    `opponent1_id` INT UNSIGNED NULL,
    `opponent2_id` INT UNSIGNED NULL,
    `opponent3_id` INT UNSIGNED NULL,
    `refreshed_at` DATE NOT NULL,
    `battles_today` TINYINT UNSIGNED DEFAULT 0,
    PRIMARY KEY (`character_id`),
    CONSTRAINT `fk_pvp_char` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- BATTLE LOGS (optional, for replay/history)
-- =============================================

DROP TABLE IF EXISTS `battle_logs`;
CREATE TABLE `battle_logs` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `character_id` INT UNSIGNED NOT NULL,
    `battle_type` ENUM('mob','boss','pvp') NOT NULL,
    `opponent_id` INT UNSIGNED NOT NULL,
    `result` ENUM('victory','defeat') NOT NULL,
    `exp_gained` INT UNSIGNED DEFAULT 0,
    `gold_gained` INT UNSIGNED DEFAULT 0,
    `prestige_gained` INT UNSIGNED DEFAULT 0,
    `battle_data` JSON NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_char_type` (`character_id`, `battle_type`),
    KEY `idx_created` (`created_at`),
    CONSTRAINT `fk_log_char` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
