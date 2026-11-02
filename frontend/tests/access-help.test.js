// Подсказка «забыли логин/пароль», поиск пользователя в админке и тексты
// политик без ФИО.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('index.html');

assert.match(index, /id="authLoginHelp">Если вы забыли логин и\/или пароль, напишите на почту <a href="mailto:support@aegis-sec-library\.ru">support@aegis-sec-library\.ru<\/a>/);
// Подсказка внутри блока, который скрывается на вкладке регистрации.
const hint = index.slice(index.indexOf('id="forgotPasswordHint"'), index.indexOf('</form>', index.indexOf('id="forgotPasswordHint"')));
assert.ok(hint.includes('authLoginHelp'));
assert.match(read('desktop-stability.css'), /css\/components\/auth\.css/);
assert.ok(read('sw.js').includes("'/css/components/auth.css'"));

// ФИО нигде не спрашивается.
assert.doesNotMatch(index, /authFirstName|authLastName|editFullName|editProfileModal/);
const privacy = read('legal/privacy.html');
const consent = read('legal/consent.html');
for (const doc of [privacy, consent]) assert.doesNotMatch(doc, /имя и фамилия|ФИО/);
assert.match(privacy, /id="access-recovery"/);
assert.match(privacy, /ни администратор, ни кто-либо ещё не может его посмотреть/);
assert.match(privacy, /сертификаты выписываются на логин/);

// В админке: поиск по логину и кнопка временного пароля.
const admin = read('admin-screens.js');
assert.match(admin, /lookupInput\.id = 'adminUsersSearch'/);
assert.match(admin, /'Временный пароль'/);

console.log('access help tests passed');
