// SPDX-License-Identifier: MIT
const path = require('node:path');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const env = {...process.env, WORKBENCH_TEST:'1', WORKBENCH_USER_DATA:path.join(root,'.local','user-data')};
require('node:fs').mkdirSync(env.WORKBENCH_USER_DATA,{recursive:true});
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [root], {cwd:root, env, stdio:'inherit', windowsHide:false});
child.on('error', error => {console.error(error.message); process.exitCode=1;});
child.on('exit', (code,signal) => {process.exitCode=signal?1:code??1;});
