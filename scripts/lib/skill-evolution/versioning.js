'use strict';

const fs = require('fs');
const path = require('path');

const { appendFile, ensureDir } = require('../utils');

const VERSION_DIRECTORY_NAME = '.versions';
const EVOLUTION_DIRECTORY_NAME = '.evolution';
const EVOLUTION_LOG_TYPES = Object.freeze([
  'observations',
  'inspections',
  'amendments',
]);

function normalizeSkillDir(skillPath) {
  if (!skillPath || typeof skillPath !== 'string') {
    throw new Error('skillPath is required');
  }

  const resolvedPath = path.resolve(skillPath);
  if (path.basename(resolvedPath) === 'SKILL.md') {
    return path.dirname(resolvedPath);
  }

  return resolvedPath;
}

function getSkillFilePath(skillPath) {
  return path.join(normalizeSkillDir(skillPath), 'SKILL.md');
}

function ensureSkillExists(skillPath) {
  const skillFilePath = getSkillFilePath(skillPath);
  if (!fs.existsSync(skillFilePath)) {
    throw new Error(`Skill file not found: ${skillFilePath}`);
  }

  return skillFilePath;
}

function getVersionsDir(skillPath) {
  return path.join(normalizeSkillDir(skillPath), VERSION_DIRECTORY_NAME);
}

function getEvolutionDir(skillPath) {
  return path.join(normalizeSkillDir(skillPath), EVOLUTION_DIRECTORY_NAME);
}

function getEvolutionLogPath(skillPath, logType) {
  if (!EVOLUTION_LOG_TYPES.includes(logType)) {
    throw new Error(`Unknown evolution log type: ${logType}`);
  }

  return path.join(getEvolutionDir(skillPath), `${logType}.jsonl`);
}

function ensureSkillVersioning(skillPath) {
  ensureSkillExists(skillPath);

  const versionsDir = getVersionsDir(skillPath);
  const evolutionDir = getEvolutionDir(skillPath);

  ensureDir(versionsDir);
  ensureDir(evolutionDir);

  for (const logType of EVOLUTION_LOG_TYPES) {
    const logPath = getEvolutionLogPath(skillPath, logType);
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '', 'utf8');
    }
  }

  return {
    versionsDir,
    evolutionDir,
  };
}

function parseVersionNumber(fileName) {
  const match = /^v(\d+)\.md$/.exec(fileName);
  if (!match) {
    return null;
  }

  const version = Number(match[1]);
  return Number.isSafeInteger(version) && version >= 1 ? version : null;
}

function listVersions(skillPath) {
  const versionsDir = getVersionsDir(skillPath);
  if (!fs.existsSync(versionsDir)) {
    return [];
  }

  return fs.readdirSync(versionsDir)
    .map(fileName => {
      const version = parseVersionNumber(fileName);
      if (version === null) {
        return null;
      }

      const filePath = path.join(versionsDir, fileName);
      let stats;
      try {
        stats = fs.statSync(filePath);
      } catch (error) {
        // A dangling link still occupies a path, but is not a readable snapshot.
        if (error.code === 'ENOENT') return null;
        throw error;
      }
      if (!stats.isFile()) {
        return null;
      }

      return {
        version,
        path: filePath,
        created_at: stats.mtime.toISOString(),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.version - right.version);
}

function getCurrentVersion(skillPath) {
  const skillFilePath = getSkillFilePath(skillPath);
  if (!fs.existsSync(skillFilePath)) {
    return 0;
  }

  const versions = listVersions(skillPath);
  if (versions.length === 0) {
    return 1;
  }

  return versions[versions.length - 1].version;
}

function appendEvolutionRecord(skillPath, logType, record) {
  ensureSkillVersioning(skillPath);
  appendFile(getEvolutionLogPath(skillPath, logType), `${JSON.stringify(record)}\n`);
  return { ...record };
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .reduce((rows, line) => {
      try {
        const record = JSON.parse(line);
        if (record && typeof record === 'object' && !Array.isArray(record)) {
          rows.push(record);
        }
      } catch {
        // Ignore malformed rows so the log remains append-only and resilient.
      }
      return rows;
    }, []);
}

function getEvolutionLog(skillPath, logType) {
  return readJsonl(getEvolutionLogPath(skillPath, logType));
}

function createVersion(skillPath, options = {}) {
  const skillFilePath = ensureSkillExists(skillPath);

  const versions = listVersions(skillPath);
  const versionsDir = getVersionsDir(skillPath);
  const occupiedPaths = new Set(fs.existsSync(versionsDir) ? fs.readdirSync(versionsDir) : []);
  let nextVersion = versions.length === 0 ? 1 : versions[versions.length - 1].version + 1;
  // Listing excludes non-files, but their paths remain user-owned and occupied.
  while (Number.isSafeInteger(nextVersion) && occupiedPaths.has(`v${nextVersion}.md`)) {
    nextVersion += 1;
  }
  if (!Number.isSafeInteger(nextVersion)) {
    throw new Error('Skill snapshot version range is exhausted; existing snapshots were preserved');
  }
  ensureSkillVersioning(skillPath);
  const snapshotPath = path.join(versionsDir, `v${nextVersion}.md`);
  const skillContent = fs.readFileSync(skillFilePath, 'utf8');
  const createdAt = options.timestamp || new Date().toISOString();

  fs.writeFileSync(snapshotPath, skillContent, { encoding: 'utf8', flag: 'wx' });
  appendEvolutionRecord(skillPath, 'amendments', {
    event: 'snapshot',
    version: nextVersion,
    reason: options.reason || null,
    author: options.author || null,
    status: 'applied',
    created_at: createdAt,
  });

  return {
    version: nextVersion,
    path: snapshotPath,
    created_at: createdAt,
  };
}

function rollbackTo(skillPath, targetVersion, options = {}) {
  const normalizedTargetVersion = Number(targetVersion);
  if (!Number.isInteger(normalizedTargetVersion) || normalizedTargetVersion <= 0) {
    throw new Error(`Invalid target version: ${targetVersion}`);
  }

  ensureSkillExists(skillPath);
  ensureSkillVersioning(skillPath);

  const targetPath = path.join(getVersionsDir(skillPath), `v${normalizedTargetVersion}.md`);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Version not found: v${normalizedTargetVersion}`);
  }

  const currentVersion = getCurrentVersion(skillPath);
  const targetContent = fs.readFileSync(targetPath, 'utf8');
  fs.writeFileSync(getSkillFilePath(skillPath), targetContent, 'utf8');

  const createdVersion = createVersion(skillPath, {
    timestamp: options.timestamp,
    reason: options.reason || `rollback to v${normalizedTargetVersion}`,
    author: options.author || null,
  });

  appendEvolutionRecord(skillPath, 'amendments', {
    event: 'rollback',
    version: createdVersion.version,
    source_version: currentVersion,
    target_version: normalizedTargetVersion,
    reason: options.reason || null,
    author: options.author || null,
    status: 'applied',
    created_at: options.timestamp || new Date().toISOString(),
  });

  return createdVersion;
}

module.exports = {
  EVOLUTION_DIRECTORY_NAME,
  EVOLUTION_LOG_TYPES,
  VERSION_DIRECTORY_NAME,
  appendEvolutionRecord,
  createVersion,
  ensureSkillVersioning,
  getCurrentVersion,
  getEvolutionDir,
  getEvolutionLog,
  getEvolutionLogPath,
  getVersionsDir,
  listVersions,
  rollbackTo,
};
