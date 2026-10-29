import * as migration_20261029_095446 from './20261029_095446';
import * as migration_20261029_103002 from './20261029_103002';
import * as migration_20261029_105104 from './20261029_105104';

export const migrations = [
  {
    up: migration_20261029_095446.up,
    down: migration_20261029_095446.down,
    name: '20261029_095446',
  },
  {
    up: migration_20261029_103002.up,
    down: migration_20261029_103002.down,
    name: '20261029_103002',
  },
  {
    up: migration_20261029_105104.up,
    down: migration_20261029_105104.down,
    name: '20261029_105104'
  },
];
