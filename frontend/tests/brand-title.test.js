// Название приложения в шапке и боковом меню, а также проверка, что
// назначение книг и отделы убраны полностью.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');

// Светлая тема подключена.
const light = read('css/components/theme-light.css');
assert.match(light, /:root\[data-theme="light"\] \{ --on-accent: #ffffff; \}/);
assert.match(read('desktop-stability.css'), /theme-light\.css/);
assert.ok(read('sw.js').includes("'/css/components/theme-light.css'"));

// Вместо логотипа — название в две строки: «Центр знаний» / «по кибербезопасности».
assert.match(index, /class="sidebar-brand-title brand-title"><span>Центр знаний<\/span> <span>по кибербезопасности</);
assert.match(index, /class="logo-name home-brand-title brand-title"><span>Центр знаний<\/span> <span>по кибербезопасности</);
assert.doesNotMatch(index, /sidebar-logo-text|<span class="gradient-text">AEGIS<\/span>.*home/);
assert.doesNotMatch(index.slice(index.indexOf('id="homeScreen"'), index.indexOf('id="homeScreen"') + 1500), /class="logo-sm"|>\s*AEGIS\s*</);
assert.doesNotMatch(index, /&shy;/);
// Каждая строка не переносится, а размер шрифта подстраивается под ширину.
const shell = read('css/components/responsive-shell.css');
assert.match(shell, /\.brand-title \{\s*container-type: inline-size;/);
assert.match(shell, /\.brand-title > span \{\s*display: block;\s*white-space: nowrap;\s*font-size: clamp\(/);

// Назначение книг и отделы удалены.
for (const file of ['team.js', 'org-structure.js', 'css/components/team.css']) {
  assert.ok(!fs.existsSync(path.join(root, file)), `${file} должен быть удалён`);
}
assert.doesNotMatch(index, /teamScreen|btnTeamGo|sidebarTeam|sectionAssigned|data-atab="org"|adOrg|authDepartment|adminRecommendDepts/);
assert.doesNotMatch(read('sw.js'), /team\.js|org-structure\.js|team\.css/);
assert.doesNotMatch(read('navigation.js'), /team/);
assert.doesNotMatch(read('api.js'), /\/team\/|\/org\/|managed-department|\/required/);
for (const file of ['auth-ui.js', 'account-profile.js', 'admin-screens.js', 'admin-users.js', 'library-home.js',
  'recommendations.js', 'home-recommendations.js', 'assistant-chat.js', 'profile-screen.js']) {
  assert.doesNotMatch(read(file), /department|Department|managed_|assignment|Assign/, file);
}

console.log('brand title tests passed');
