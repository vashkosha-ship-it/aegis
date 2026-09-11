// AR camera and cybersecurity scheme screens.
// Loaded as a classic script before app.js; public handlers intentionally remain global.

// ========== AR SYSTEM ==========
// ========== AR SYSTEM (схемы атак поверх видео) ==========
let arStream = null;
let arActive = false;
let arFacingMode = 'environment';  // 'environment' = задняя камера, 'user' = фронтальная
let arCurrentScheme = null;          // 'killchain' | 'owasp' | ...

// Открытие меню выбора схемы из кнопки в хедере
function openARSchemeMenu() {
  document.getElementById('arSchemeMenuModal').classList.remove('hidden');
}

function closeARSchemeMenu() {
  document.getElementById('arSchemeMenuModal').classList.add('hidden');
}

// Открытие AR-экрана с конкретной схемой
async function openARWithScheme(schemeCode, initialStageId = null) {
  closeARSchemeMenu();
  arCurrentScheme = schemeCode;
  arActiveSchemeCode = AR_SCHEMES[schemeCode] ? schemeCode : 'killchain';

  const titles = {
    killchain: 'Cyber Kill Chain',
    owasp: 'OWASP Top 10',
    osi: 'Модель OSI',
    mitre: 'MITRE ATT&CK',
    nist: 'NIST CSF',
    ir: 'Реагирование на инциденты',
    did: 'Эшелонированная защита',
    stride: 'STRIDE',
  };
  document.getElementById('arSchemeTitle').textContent = titles[schemeCode] || 'Схема';

  document.getElementById('arSchemeContainer').replaceChildren();
  document.getElementById('arModal').classList.add('active');

  // Сначала рендерим схему (она не зависит от камеры), потом запускаем камеру
  // в фоне. На iOS await getUserMedia мог зависать и схема не появлялась.
  renderARScheme(schemeCode);
  startARCamera().catch(e => console.warn('AR-камера недоступна:', e));

  // Если передали этап — сразу его подсветить и открыть детали
  if (initialStageId && schemeCode === 'killchain') {
    setTimeout(() => selectKillChainStage(initialStageId), 100);
  }
}

async function startARCamera() {
  // Проверяем, поддерживается ли getUserMedia
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('getUserMedia не поддерживается');
    showToast('Ваш браузер не поддерживает камеру, схема отображается на фоне');
    return;
  }

  try {
    // Для ПК используем 'environment' если есть камера, иначе 'user'
    const constraints = {
      video: { 
        facingMode: arFacingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false,
    };
    
    arStream = await navigator.mediaDevices.getUserMedia(constraints);
    const v = document.getElementById('arVideo');
    if (v) {
      v.srcObject = arStream;
      await v.play();
      arActive = true;
    }
  } catch (e) {
    console.error('Ошибка доступа к камере:', e);
    let errorMsg = 'Нет доступа к камере. ';
    if (e.name === 'NotAllowedError') {
      errorMsg += 'Разрешите доступ к камере в настройках браузера.';
    } else if (e.name === 'NotFoundError') {
      errorMsg += 'Камера не найдена на устройстве.';
    } else {
      errorMsg += 'Схема будет показана на тёмном фоне.';
    }
    showToast(errorMsg);
    // Не падаем — схема всё равно рендерится поверх чёрного фона
  }
}
function closeAR() {
  console.log('closeAR вызвана');
  const toggle = document.getElementById('arViewModeToggle');
  if (toggle) toggle.style.display = 'none';
  
  // Останавливаем камеру
  if (arStream) {
    arStream.getTracks().forEach(t => t.stop());
    arStream = null;
  }
  
  arActive = false;
  arCurrentScheme = null;
  arSelectedStage = null;
  
  // Закрываем модалку
  const arModal = document.getElementById('arModal');
  if (arModal) {
    arModal.classList.remove('active');
    // Скрываем через style на случай, если classList не сработал
    arModal.style.display = 'none';
  }
  
  // ПОЛНОСТЬЮ ОЧИЩАЕМ контейнер схемы
  const schemeContainer = document.getElementById('arSchemeContainer');
  if (schemeContainer) {
    schemeContainer.replaceChildren();
    // Убираем все inline стили, которые могли добавиться
    schemeContainer.removeAttribute('style');
  }
  
  // Останавливаем видео
  const video = document.getElementById('arVideo');
  if (video) {
    video.pause();
    video.srcObject = null;
    video.load();
  }
  
  // Убираем возможные остаточные панели
  const stageDetails = document.getElementById('arStageDetails');
  if (stageDetails) {
    stageDetails.style.display = 'none';
    stageDetails.replaceChildren();
  }
  
  const stageHint = document.getElementById('arStageHint');
  if (stageHint) {
    stageHint.style.display = 'block';
  }
  
  // Сбрасываем overlay
  const overlay = document.querySelector('.ar-modal-overlay');
  if (overlay) {
    overlay.style.display = '';
  }
}

async function switchARCamera() {
  arFacingMode = arFacingMode === 'environment' ? 'user' : 'environment';
  // Останавливаем текущий поток
  if (arStream) {
    arStream.getTracks().forEach(t => t.stop());
    arStream = null;
  }
  // Перезапускаем с новым facingMode
  await startARCamera();
}
// Данные схемы Cyber Kill Chain — 7 этапов атаки
const AR_KILL_CHAIN = {
  title: 'Cyber Kill Chain',
  subtitle: '7 этапов кибератаки (Lockheed Martin)',
  stages: [
    {
      id: 1,
      code: 'recon',
      name: 'Reconnaissance',
      nameRu: 'Разведка',
      description: 'Атакующий собирает информацию о цели — людях, инфраструктуре, технологиях. Без активного взаимодействия с целевой системой.',
      attacker: [
        'OSINT — поиск в открытых источниках',
        'Сканирование DNS, поддоменов',
        'Сбор email-адресов сотрудников',
        'Изучение публикаций и стека компании',
      ],
      defender: [
        'Минимизация информации в открытых источниках',
        'Обучение сотрудников OPSEC',
        'Мониторинг threat intelligence-фидов',
      ],
      relatedCategory: 'Технический оффенсив',
      metaphor: 'Глаз / бинокль, сканирующий цифровые тени цели',
      defenseMethod: { code: 'Detect', nameRu: 'Обнаружение', color: '#3b82f6' },
      defenseTools: ['Анализ логов веб-сервера', 'WHOIS-маскировка', 'Threat Intelligence фиды', 'Обучение OPSEC'],
    },
    {
      id: 2,
      code: 'weapon',
      name: 'Weaponization',
      nameRu: 'Вооружение',
      description: 'Атакующий готовит средство атаки — связку «эксплойт + полезная нагрузка» для конкретной цели.',
      attacker: [
        'Упаковка malware в офисный документ',
        'Создание PDF с эксплойтом',
        'Подготовка фейкового сайта',
        'Сборка фишингового письма',
      ],
      defender: [
        'Этот этап на стороне атакующего — напрямую защититься нельзя',
        'Threat intelligence помогает узнавать о свежих инструментах',
      ],
      relatedCategory: 'Реверс-инжиниринг и анализ вредоносного ПО',
      metaphor: 'Рука, прикрепляющая взрыватель к боеголовке',
      defenseMethod: { code: 'Deny', nameRu: 'Уничтожение', color: '#8b5cf6' },
      defenseTools: ['Прямая защита невозможна — этап на стороне атакующего', 'Threat Intelligence о свежих инструментах'],
    },
    {
      id: 3,
      code: 'deliver',
      name: 'Delivery',
      nameRu: 'Доставка',
      description: 'Атакующий передаёт оружие жертве. Первый этап, когда атакующий взаимодействует с целью.',
      attacker: [
        'Фишинговый email с вложением или ссылкой',
        'Заражение легитимного сайта (watering hole)',
        'USB-устройство, оставленное на парковке',
        'Эксплуатация публичных сервисов компании',
      ],
      defender: [
        'Фильтрация почты, sandboxing вложений',
        'Web-фильтрация и блокировка категорий',
        'Блокировка USB-устройств политикой',
        'Регулярный патчинг публичных сервисов',
      ],
      relatedCategory: 'Социальная инженерия и человеческий фактор',
      metaphor: 'Летящее копьё / фишинговая стрела',
      defenseMethod: { code: 'Disrupt', nameRu: 'Блокировка', color: '#ef4444' },
      defenseTools: ['Прокси-серверы', 'Спам-фильтры', 'Песочницы для вложений', 'Запрет USB-носителей'],
    },
    {
      id: 4,
      code: 'exploit',
      name: 'Exploitation',
      nameRu: 'Эксплуатация',
      description: 'На стороне жертвы срабатывает эксплойт. Атакующий получает первичную возможность выполнения кода.',
      attacker: [
        'Эксплойт уязвимости в браузере/офисном пакете',
        'Обход sandbox',
        'Social engineering: «включите макросы»',
        'Эксплуатация неизвестных (zero-day) уязвимостей',
      ],
      defender: [
        'Быстрый патчинг',
        'EDR/антивирус с поведенческим анализом',
        'Отключение макросов по умолчанию',
        'ASLR, DEP, application whitelisting',
      ],
      relatedCategory: 'Разработка безопасного ПО (AppSec)',
      metaphor: 'Трескающаяся броня / проникновение вируса в код',
      defenseMethod: { code: 'Degrade', nameRu: 'Предотвращение', color: '#f59e0b' },
      defenseTools: ['Патч-менеджмент', 'Антивирус / HIPS', 'EMET', 'ASLR, DEP, whitelisting'],
    },
    {
      id: 5,
      code: 'install',
      name: 'Installation',
      nameRu: 'Установка',
      description: 'Атакующий закрепляется в системе. Устанавливает постоянный доступ, который переживёт перезагрузку.',
      attacker: [
        'Установка backdoor или RAT',
        'Размещение web-shell на сервере',
        'Добавление в автозагрузку',
        'Создание scheduled task или подмена службы',
      ],
      defender: [
        'EDR с поведенческим анализом',
        'Контроль целостности файлов',
        'Мониторинг подозрительных процессов',
        'Ограничение прав пользователей',
      ],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)',
      metaphor: 'Червь / имплант, пускающий корни в системе',
      defenseMethod: { code: 'Deceive', nameRu: 'Изоляция', color: '#06b6d4' },
      defenseTools: ['Минимальные привилегии', 'Контроль UAC', 'Проверка целостности файлов', 'Honeypot-ловушки'],
    },
    {
      id: 6,
      code: 'c2',
      name: 'Command & Control',
      nameRu: 'Управление (C2)',
      description: 'Атакующий устанавливает канал связи между жертвой и своей инфраструктурой. Через него отправляются команды.',
      attacker: [
        'HTTPS-туннели на свои серверы',
        'DNS-туннелирование',
        'Использование легитимных платформ (GitHub, Discord) как C2',
        'Domain fronting',
      ],
      defender: [
        'Анализ сетевого трафика (NDR)',
        'DNS-мониторинг и фильтрация',
        'Threat hunting по индикаторам компрометации',
        'Ограничение исходящего трафика',
      ],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)',
      metaphor: 'Кукловод с нитями / антенна, шлющая маячки наружу',
      defenseMethod: { code: 'Disrupt', nameRu: 'Обрыв связи', color: '#ef4444' },
      defenseTools: ['Блокировка IP/DNS на фаерволах', 'Deep Packet Inspection', 'NDR-анализ трафика', 'Threat hunting'],
    },
    {
      id: 7,
      code: 'actions',
      name: 'Actions on Objectives',
      nameRu: 'Действия',
      description: 'Атакующий достигает основной цели — кражи данных, шифрования, саботажа или распространения внутри сети.',
      attacker: [
        'Эксфильтрация конфиденциальных данных',
        'Развёртывание ransomware',
        'Lateral movement к более ценным системам',
        'Привилегиэскалация (Domain Admin)',
      ],
      defender: [
        'Сегментация сети',
        'Шифрование чувствительных данных',
        'DLP-системы',
        'Регулярные резервные копии',
        'Privileged Access Management',
      ],
      relatedCategory: 'Практический менеджмент и GRC (Управление, риск, соответствие)',
      metaphor: 'Раскрытый сейф / перетекающие данные / красная кнопка тревоги',
      defenseMethod: { code: 'Contain', nameRu: 'Сдерживание', color: '#dc2626' },
      defenseTools: ['DLP-системы', 'Сегментация сети', 'Мониторинг аномалий трафика', 'Резервные копии + PAM'],
    },
  ],
};

// ===================== ДОПОЛНИТЕЛЬНЫЕ AR-СХЕМЫ =====================
// Структура этапа идентична AR_KILL_CHAIN.stages, поэтому общий рендер
// работает для всех схем без изменений.

const AR_OWASP = {
  title: 'OWASP Top 10',
  subtitle: 'Топ-10 рисков веб-приложений (2021)',
  stages: [
    { id: 1, code: 'a01', name: 'Broken Access Control', nameRu: 'Контроль доступа',
      description: 'Нарушение разграничения доступа: пользователь получает права или данные, которые ему не положены (IDOR, обход проверок, повышение привилегий).',
      attacker: ['Подмена идентификаторов (IDOR)', 'Обход проверок на клиенте', 'Force browsing к скрытым URL', 'Повышение привилегий через параметры'],
      defender: ['Запрет по умолчанию (deny by default)', 'Проверки доступа на сервере', 'RBAC/ABAC', 'Логирование отказов доступа'],
      metaphor: 'Дверь без замка: любой толкнул — и вошёл в чужую комнату',
      defenseMethod: { code: 'Deny', nameRu: 'Запрет по умолчанию', color: '#ef4444' },
      defenseTools: ['RBAC/ABAC', 'Серверные проверки', 'OWASP ASVS', 'Аудит доступа'],
      relatedCategory: 'Веб-безопасность' },
    { id: 2, code: 'a02', name: 'Cryptographic Failures', nameRu: 'Сбои криптографии',
      description: 'Слабая или отсутствующая криптография: данные передаются/хранятся открыто, используются устаревшие алгоритмы или хардкод-ключи.',
      attacker: ['Перехват трафика без TLS', 'Брутфорс слабых хешей', 'Кража ключей из кода', 'Downgrade-атаки на TLS'],
      defender: ['TLS 1.2+ везде', 'Сильные алгоритмы (AES-GCM, Argon2)', 'Хранение секретов в KMS/Vault', 'Шифрование данных «на покое»'],
      metaphor: 'Сейф с прозрачными стенками — содержимое видно всем',
      defenseMethod: { code: 'Encrypt', nameRu: 'Шифрование', color: '#3b82f6' },
      defenseTools: ['TLS/HSTS', 'Argon2/bcrypt', 'KMS/Vault', 'mozilla-observatory'],
      relatedCategory: 'Криптография' },
    { id: 3, code: 'a03', name: 'Injection', nameRu: 'Инъекции',
      description: 'Недоверенные данные попадают в интерпретатор как часть команды: SQL, NoSQL, OS-command, LDAP. Включает XSS.',
      attacker: ['SQL/NoSQL-инъекции', 'OS command injection', 'XSS через незаэкранированный вывод', 'LDAP/XPath-инъекции'],
      defender: ['Параметризованные запросы', 'Экранирование вывода', 'Валидация по белому списку', 'ORM и подготовленные выражения'],
      metaphor: 'Записка с приказом, подсунутая в стопку доверенных команд',
      defenseMethod: { code: 'Validate', nameRu: 'Валидация ввода', color: '#10b981' },
      defenseTools: ['Prepared statements', 'CSP', 'WAF', 'Линтеры безопасности'],
      relatedCategory: 'Веб-безопасность' },
    { id: 4, code: 'a04', name: 'Insecure Design', nameRu: 'Небезопасный дизайн',
      description: 'Изъяны заложены в архитектуре: отсутствие моделирования угроз, небезопасные паттерны, нет лимитов и контролей бизнес-логики.',
      attacker: ['Эксплуатация логики бизнес-процессов', 'Обход недостающих лимитов', 'Злоупотребление сценариями восстановления'],
      defender: ['Threat modeling на этапе дизайна', 'Secure design patterns', 'Лимиты и rate-limit', 'Разбор злоупотреблений (abuse cases)'],
      metaphor: 'Кривой фундамент: стены ровные, но дом всё равно падает',
      defenseMethod: { code: 'Design', nameRu: 'Безопасный дизайн', color: '#a855f7' },
      defenseTools: ['STRIDE', 'OWASP ASVS', 'Abuse cases', 'Security requirements'],
      relatedCategory: 'Разработка безопасного ПО (AppSec)' },
    { id: 5, code: 'a05', name: 'Security Misconfiguration', nameRu: 'Ошибки конфигурации',
      description: 'Дефолтные настройки, лишние сервисы, подробные ошибки, открытые облачные хранилища, отсутствие заголовков безопасности.',
      attacker: ['Дефолтные учётки', 'Открытые S3-бакеты', 'Подробные стек-трейсы', 'Лишние включённые сервисы'],
      defender: ['Hardening и baseline', 'Минимизация поверхности', 'Заголовки безопасности', 'Автопроверка конфигураций'],
      metaphor: 'Новоселье с дверью на дефолтном пароле «admin/admin»',
      defenseMethod: { code: 'Harden', nameRu: 'Усиление', color: '#f59e0b' },
      defenseTools: ['CIS Benchmarks', 'IaC-сканеры', 'Security headers', 'Config management'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 6, code: 'a06', name: 'Vulnerable Components', nameRu: 'Уязвимые компоненты',
      description: 'Использование библиотек/фреймворков с известными уязвимостями, без отслеживания версий и патчей.',
      attacker: ['Эксплойты известных CVE', 'Атаки на цепочку поставок', 'Устаревшие зависимости'],
      defender: ['SCA/SBOM', 'Регулярные обновления', 'Мониторинг CVE', 'Минимизация зависимостей'],
      metaphor: 'Цепь из ржавых звеньев — рвётся на самом слабом',
      defenseMethod: { code: 'Patch', nameRu: 'Обновления', color: '#3b82f6' },
      defenseTools: ['Dependabot', 'OWASP Dependency-Check', 'SBOM', 'Snyk'],
      relatedCategory: 'Разработка безопасного ПО (AppSec)' },
    { id: 7, code: 'a07', name: 'Identification & Auth Failures', nameRu: 'Сбои аутентификации',
      description: 'Слабая аутентификация: предсказуемые сессии, отсутствие MFA, перебор паролей, небезопасное восстановление доступа.',
      attacker: ['Credential stuffing', 'Брутфорс паролей', 'Перехват/фиксация сессии', 'Обход восстановления пароля'],
      defender: ['MFA', 'Защита от перебора', 'Безопасные сессии', 'Политики паролей и блокировок'],
      metaphor: 'Охранник, верящий любому, кто назвал чужое имя',
      defenseMethod: { code: 'Authn', nameRu: 'Аутентификация', color: '#10b981' },
      defenseTools: ['MFA/FIDO2', 'Rate limiting', 'Secure cookies', 'Password managers'],
      relatedCategory: 'Криптография' },
    { id: 8, code: 'a08', name: 'Software & Data Integrity', nameRu: 'Целостность данных',
      description: 'Доверие коду/данным без проверки целостности: небезопасные обновления, десериализация, скомпрометированный CI/CD.',
      attacker: ['Подмена обновлений', 'Insecure deserialization', 'Атака на CI/CD-пайплайн'],
      defender: ['Цифровые подписи артефактов', 'Проверка целостности', 'Защита пайплайна', 'Безопасная десериализация'],
      metaphor: 'Посылка без пломбы: неизвестно, кто её вскрывал',
      defenseMethod: { code: 'Verify', nameRu: 'Проверка целостности', color: '#a855f7' },
      defenseTools: ['Sigstore/подписи', 'SLSA', 'Subresource Integrity', 'Защита CI/CD'],
      relatedCategory: 'Разработка безопасного ПО (AppSec)' },
    { id: 9, code: 'a09', name: 'Logging & Monitoring Failures', nameRu: 'Сбои логирования',
      description: 'Недостаточное логирование и мониторинг: атаки остаются незамеченными, нет алертов и реагирования.',
      attacker: ['Действия без следов в логах', 'Удаление/подмена логов', 'Медленные атаки под радаром'],
      defender: ['Централизованные логи (SIEM)', 'Алерты на аномалии', 'Защита целостности логов', 'План реагирования'],
      metaphor: 'Камеры есть, но никто не смотрит на мониторы',
      defenseMethod: { code: 'Detect', nameRu: 'Обнаружение', color: '#3b82f6' },
      defenseTools: ['SIEM', 'Аудит-логи', 'Алертинг', 'IR-плейбуки'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
    { id: 10, code: 'a10', name: 'SSRF', nameRu: 'SSRF',
      description: 'Server-Side Request Forgery: сервер по запросу злоумышленника обращается к внутренним ресурсам или облачным метаданным.',
      attacker: ['Доступ к internal-сервисам', 'Чтение облачных метаданных (169.254.169.254)', 'Сканирование внутренней сети'],
      defender: ['Белый список адресов', 'Запрет приватных диапазонов', 'Сегментация', 'Защита метаданных (IMDSv2)'],
      metaphor: 'Курьер, которого обманом отправили во внутренний сейф компании',
      defenseMethod: { code: 'Isolate', nameRu: 'Изоляция', color: '#f59e0b' },
      defenseTools: ['Allowlist URL', 'Egress firewall', 'IMDSv2', 'Сегментация сети'],
      relatedCategory: 'Веб-безопасность' },
  ],
};

const AR_OSI = {
  title: 'Модель OSI',
  subtitle: '7 уровней сетевого взаимодействия',
  stages: [
    { id: 1, code: 'l1', name: 'Physical', nameRu: 'Физический',
      description: 'Передача битов по физической среде: кабели, радио, оптика, разъёмы, напряжения.',
      attacker: ['Прослушка кабеля (tapping)', 'Глушение радиосигнала', 'Физический доступ к портам'],
      defender: ['Контроль доступа в помещения', 'Экранирование и опломбирование', 'Отключение неиспользуемых портов'],
      metaphor: 'Дорога и провода, по которым едут сигналы',
      defenseMethod: { code: 'Phys', nameRu: 'Физическая защита', color: '#64748b' },
      defenseTools: ['Port security', 'СКУД', 'Опломбирование', 'TEMPEST-экранирование'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 2, code: 'l2', name: 'Data Link', nameRu: 'Канальный',
      description: 'Кадры между узлами в пределах сегмента: MAC-адреса, коммутация, обнаружение ошибок.',
      attacker: ['ARP-spoofing', 'MAC-flooding', 'VLAN hopping'],
      defender: ['Dynamic ARP Inspection', 'Port security', 'Разделение VLAN', '802.1X'],
      metaphor: 'Почтальон, разносящий письма соседям по дому',
      defenseMethod: { code: 'L2', nameRu: 'Защита канала', color: '#3b82f6' },
      defenseTools: ['DAI', '802.1X', 'Port security', 'BPDU Guard'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 3, code: 'l3', name: 'Network', nameRu: 'Сетевой',
      description: 'Маршрутизация пакетов между сетями: IP-адресация, выбор пути.',
      attacker: ['IP-spoofing', 'Атаки на маршрутизацию', 'ICMP-туннели'],
      defender: ['Фильтрация (ACL)', 'Anti-spoofing (uRPF)', 'Сегментация подсетей'],
      metaphor: 'Навигатор, прокладывающий маршрут между городами',
      defenseMethod: { code: 'L3', nameRu: 'Маршрутизация', color: '#10b981' },
      defenseTools: ['Firewall/ACL', 'uRPF', 'IPsec', 'Сегментация'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 4, code: 'l4', name: 'Transport', nameRu: 'Транспортный',
      description: 'Надёжная доставка между процессами: TCP/UDP, порты, контроль потока.',
      attacker: ['SYN-flood', 'Сканирование портов', 'Перехват сессии (TCP hijacking)'],
      defender: ['SYN cookies', 'Rate limiting', 'TLS поверх TCP', 'Мониторинг соединений'],
      metaphor: 'Служба доставки с трек-номером и подтверждением получения',
      defenseMethod: { code: 'L4', nameRu: 'Транспорт', color: '#a855f7' },
      defenseTools: ['SYN cookies', 'Anti-DDoS', 'TLS', 'Stateful firewall'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 5, code: 'l5', name: 'Session', nameRu: 'Сеансовый',
      description: 'Установка, поддержание и завершение сеансов между приложениями.',
      attacker: ['Session hijacking', 'Session fixation', 'Replay-атаки'],
      defender: ['Безопасные токены сессии', 'Тайм-ауты', 'Привязка к контексту', 'Anti-replay'],
      metaphor: 'Телефонный разговор: дозвон, беседа, корректное завершение',
      defenseMethod: { code: 'L5', nameRu: 'Сеансы', color: '#3b82f6' },
      defenseTools: ['Secure cookies', 'Session timeout', 'Nonce/anti-replay'],
      relatedCategory: 'Веб-безопасность' },
    { id: 6, code: 'l6', name: 'Presentation', nameRu: 'Представления',
      description: 'Кодирование, сжатие и шифрование данных: форматы, сериализация, TLS.',
      attacker: ['Атаки на TLS (downgrade)', 'Небезопасная десериализация', 'Подмена кодировок'],
      defender: ['Современные TLS-наборы', 'Безопасные форматы', 'Валидация сериализации'],
      metaphor: 'Переводчик, приводящий речь к понятному обеим сторонам виду',
      defenseMethod: { code: 'L6', nameRu: 'Представление', color: '#10b981' },
      defenseTools: ['TLS 1.3', 'Безопасная сериализация', 'Canonicalization'],
      relatedCategory: 'Криптография' },
    { id: 7, code: 'l7', name: 'Application', nameRu: 'Прикладной',
      description: 'Взаимодействие с приложением: HTTP, DNS, SMTP. Самый частый уровень атак.',
      attacker: ['Веб-атаки (OWASP Top 10)', 'DNS-спуфинг', 'Атаки на API'],
      defender: ['WAF', 'Валидация ввода', 'Аутентификация и авторизация', 'API-gateway'],
      metaphor: 'Витрина магазина, с которой общается покупатель',
      defenseMethod: { code: 'L7', nameRu: 'Приложение', color: '#f59e0b' },
      defenseTools: ['WAF', 'API Gateway', 'CSP', 'DNSSEC'],
      relatedCategory: 'Веб-безопасность' },
  ],
};

const AR_MITRE = {
  title: 'MITRE ATT&CK',
  subtitle: 'Тактики жизненного цикла атаки (Enterprise)',
  stages: [
    { id: 1, code: 'ta0043', name: 'Reconnaissance', nameRu: 'Разведка',
      description: 'Сбор информации для планирования атаки: цели, инфраструктура, сотрудники.',
      attacker: ['Active/passive scanning', 'Сбор данных о сотрудниках', 'Поиск технической информации'],
      defender: ['Минимизация публичной информации', 'Мониторинг сканирований', 'Threat Intelligence'],
      metaphor: 'Разведчик, изучающий крепость перед штурмом',
      defenseMethod: { code: 'Detect', nameRu: 'Обнаружение', color: '#3b82f6' },
      defenseTools: ['Threat Intel', 'Анализ логов', 'OPSEC'],
      relatedCategory: 'Технический оффенсив' },
    { id: 2, code: 'ta0042', name: 'Resource Development', nameRu: 'Подготовка ресурсов',
      description: 'Создание инфраструктуры атаки: домены, аккаунты, вредоносное ПО, C2.',
      attacker: ['Регистрация доменов', 'Покупка/создание ВПО', 'Подготовка C2-серверов'],
      defender: ['Мониторинг похожих доменов', 'Блокировка известной инфраструктуры', 'Threat hunting'],
      metaphor: 'Кузница, где куют оружие перед боем',
      defenseMethod: { code: 'Track', nameRu: 'Отслеживание', color: '#a855f7' },
      defenseTools: ['Domain monitoring', 'TI-фиды', 'Sinkholing'],
      relatedCategory: 'Технический оффенсив' },
    { id: 3, code: 'ta0001', name: 'Initial Access', nameRu: 'Первичный доступ',
      description: 'Проникновение в сеть: фишинг, эксплуатация публичных сервисов, валидные учётки.',
      attacker: ['Фишинг', 'Эксплуатация внешних сервисов', 'Кража учётных данных'],
      defender: ['Email-фильтрация', 'Патч-менеджмент', 'MFA', 'Обучение сотрудников'],
      metaphor: 'Первая нога в приоткрытой двери',
      defenseMethod: { code: 'Block', nameRu: 'Блокировка', color: '#ef4444' },
      defenseTools: ['Email security', 'MFA', 'Vuln management', 'Awareness'],
      relatedCategory: 'Социальная инженерия и человеческий фактор' },
    { id: 4, code: 'ta0002', name: 'Execution', nameRu: 'Выполнение',
      description: 'Запуск вредоносного кода на целевой системе.',
      attacker: ['Запуск скриптов (PowerShell)', 'Макросы в документах', 'Эксплойты'],
      defender: ['EDR/контроль выполнения', 'Application allowlisting', 'Отключение макросов'],
      metaphor: 'Поворот ключа зажигания вредоносной программы',
      defenseMethod: { code: 'EDR', nameRu: 'Контроль выполнения', color: '#3b82f6' },
      defenseTools: ['EDR', 'AppLocker/WDAC', 'Script logging'],
      relatedCategory: 'Реверс-инжиниринг и анализ вредоносного ПО' },
    { id: 5, code: 'ta0003', name: 'Persistence', nameRu: 'Закрепление',
      description: 'Сохранение доступа после перезагрузок и смены учётных данных.',
      attacker: ['Автозагрузка/службы', 'Запланированные задачи', 'Бэкдоры'],
      defender: ['Контроль автозапуска', 'Мониторинг изменений', 'Baseline-сравнение'],
      metaphor: 'Запасной ключ, спрятанный под ковриком',
      defenseMethod: { code: 'Monitor', nameRu: 'Мониторинг', color: '#10b981' },
      defenseTools: ['Autoruns', 'FIM', 'EDR', 'Sysmon'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
    { id: 6, code: 'ta0004', name: 'Privilege Escalation', nameRu: 'Повышение привилегий',
      description: 'Получение более высоких прав в системе.',
      attacker: ['Эксплойты ядра', 'Ошибки конфигурации прав', 'Кража токенов'],
      defender: ['Принцип наименьших привилегий', 'Патчи', 'PAM', 'Мониторинг привилегий'],
      metaphor: 'Лестница из рядового в генералы',
      defenseMethod: { code: 'PoLP', nameRu: 'Мин. привилегии', color: '#a855f7' },
      defenseTools: ['PAM', 'Patch mgmt', 'Privilege monitoring'],
      relatedCategory: 'Практический менеджмент и GRC (Управление, риск, соответствие)' },
    { id: 7, code: 'ta0005', name: 'Defense Evasion', nameRu: 'Обход защиты',
      description: 'Уклонение от обнаружения: обфускация, отключение защиты, очистка следов.',
      attacker: ['Обфускация ВПО', 'Отключение антивируса', 'Очистка логов'],
      defender: ['Защита целостности логов', 'Tamper protection', 'Поведенческий анализ'],
      metaphor: 'Камуфляж и стёртые отпечатки пальцев',
      defenseMethod: { code: 'Detect', nameRu: 'Обнаружение', color: '#3b82f6' },
      defenseTools: ['EDR', 'Tamper protection', 'Behavior analytics'],
      relatedCategory: 'Реверс-инжиниринг и анализ вредоносного ПО' },
    { id: 8, code: 'ta0006', name: 'Credential Access', nameRu: 'Доступ к учёткам',
      description: 'Кража логинов и паролей: дампы, кейлоггеры, перехват.',
      attacker: ['Дамп LSASS', 'Кейлоггеры', 'Kerberoasting'],
      defender: ['Credential Guard', 'MFA', 'Мониторинг доступа к секретам'],
      metaphor: 'Связка чужих ключей в кармане',
      defenseMethod: { code: 'Protect', nameRu: 'Защита секретов', color: '#10b981' },
      defenseTools: ['Credential Guard', 'LAPS', 'PAM', 'MFA'],
      relatedCategory: 'Криптография' },
    { id: 9, code: 'ta0007', name: 'Discovery', nameRu: 'Исследование',
      description: 'Изучение внутренней среды: системы, учётки, сеть.',
      attacker: ['Перечисление систем и пользователей', 'Сетевое сканирование изнутри'],
      defender: ['Сегментация', 'Обнаружение аномального перечисления', 'Honeypots'],
      metaphor: 'Осмотр комнат изнутри захваченного здания',
      defenseMethod: { code: 'Detect', nameRu: 'Обнаружение', color: '#3b82f6' },
      defenseTools: ['Honeypots', 'Network detection', 'Segmentation'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 10, code: 'ta0008', name: 'Lateral Movement', nameRu: 'Перемещение',
      description: 'Распространение по сети к новым системам.',
      attacker: ['Pass-the-Hash', 'RDP/SMB', 'Использование валидных учёток'],
      defender: ['Сегментация', 'MFA для внутренних сервисов', 'Мониторинг латерального трафика'],
      metaphor: 'Переход из комнаты в комнату по внутренним дверям',
      defenseMethod: { code: 'Segment', nameRu: 'Сегментация', color: '#a855f7' },
      defenseTools: ['Microsegmentation', 'PAM', 'NDR'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 11, code: 'ta0011', name: 'Command & Control', nameRu: 'Управление (C2)',
      description: 'Связь с захваченными системами для управления.',
      attacker: ['C2 по HTTPS/DNS', 'Маскировка под легитимный трафик', 'Домены-фронтинг'],
      defender: ['Анализ исходящего трафика', 'DNS-мониторинг', 'Блокировка C2'],
      metaphor: 'Рация для управления агентами в тылу',
      defenseMethod: { code: 'Detect', nameRu: 'Обнаружение', color: '#3b82f6' },
      defenseTools: ['NDR', 'DNS analytics', 'Proxy/Egress filtering'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
    { id: 12, code: 'ta0009', name: 'Collection', nameRu: 'Сбор данных',
      description: 'Сбор ценной информации перед выводом.',
      attacker: ['Сбор файлов и БД', 'Скриншоты/запись экрана', 'Архивирование данных'],
      defender: ['DLP', 'Мониторинг доступа к данным', 'Классификация данных'],
      metaphor: 'Складывание добычи в мешок перед побегом',
      defenseMethod: { code: 'DLP', nameRu: 'Защита данных', color: '#10b981' },
      defenseTools: ['DLP', 'Data classification', 'Access monitoring'],
      relatedCategory: 'Управление безопасности данных' },
    { id: 13, code: 'ta0010', name: 'Exfiltration', nameRu: 'Вывод данных',
      description: 'Кража данных из сети наружу.',
      attacker: ['Вывод по C2-каналу', 'Загрузка в облако', 'Туннелирование'],
      defender: ['DLP на периметре', 'Лимиты исходящего трафика', 'Мониторинг аномалий'],
      metaphor: 'Грузовик, вывозящий украденное за ворота',
      defenseMethod: { code: 'Block', nameRu: 'Блокировка', color: '#ef4444' },
      defenseTools: ['DLP', 'Egress filtering', 'CASB'],
      relatedCategory: 'Управление безопасности данных' },
    { id: 14, code: 'ta0040', name: 'Impact', nameRu: 'Воздействие',
      description: 'Нарушение работы: шифрование, уничтожение, подмена данных.',
      attacker: ['Шифрование (ransomware)', 'Уничтожение данных', 'DoS'],
      defender: ['Резервные копии', 'План восстановления (DRP)', 'Сегментация и иммутабельные бэкапы'],
      metaphor: 'Поджог здания на выходе',
      defenseMethod: { code: 'Recover', nameRu: 'Восстановление', color: '#f59e0b' },
      defenseTools: ['Immutable backups', 'DRP/BCP', 'EDR rollback'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
  ],
};

// Реестр всех схем. Активная схема выбирается в openARWithScheme.

// ─── NIST Cybersecurity Framework ──────────────────────────────────────────
const AR_NIST = {
  title: 'NIST Cybersecurity Framework',
  subtitle: '5 функций управления киберрисками',
  stages: [
    { id: 1, code: 'ID', name: 'Identify', nameRu: 'Идентификация',
      description: 'Понимание контекста: какие активы, данные, системы и риски есть в организации. Без полной инвентаризации невозможно защищаться.',
      attacker: ['Использование неучтённых активов', 'Атака на забытые системы', 'Эксплуатация теневого ИТ'],
      defender: ['Инвентаризация активов', 'Оценка рисков', 'Управление уязвимостями', 'Классификация данных'],
      metaphor: 'Карта владений: нельзя охранять то, о существовании чего не знаешь',
      defenseMethod: { code: 'Inventory', nameRu: 'Учёт активов', color: '#3b82f6' },
      defenseTools: ['CMDB', 'Asset discovery', 'Risk register', 'Data classification'],
      relatedCategory: 'Управление, риски и соответствие (GRC)' },
    { id: 2, code: 'PR', name: 'Protect', nameRu: 'Защита',
      description: 'Внедрение защитных мер для ограничения воздействия инцидентов: контроль доступа, обучение, защита данных, обслуживание.',
      attacker: ['Обход слабых средств защиты', 'Эксплуатация необученных сотрудников', 'Атака на незащищённые данные'],
      defender: ['Контроль доступа и MFA', 'Шифрование данных', 'Обучение персонала', 'Защита и обслуживание систем'],
      metaphor: 'Стены, замки и охрана крепости',
      defenseMethod: { code: 'Defend', nameRu: 'Защита', color: '#10b981' },
      defenseTools: ['IAM/MFA', 'Шифрование', 'Awareness training', 'Hardening'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 3, code: 'DE', name: 'Detect', nameRu: 'Обнаружение',
      description: 'Своевременное выявление событий безопасности: мониторинг, обнаружение аномалий, непрерывный анализ.',
      attacker: ['Действия под радаром', 'Медленные атаки', 'Сокрытие следов'],
      defender: ['Непрерывный мониторинг (SIEM)', 'Обнаружение аномалий', 'Анализ событий', 'Threat hunting'],
      metaphor: 'Сигнализация и камеры наблюдения',
      defenseMethod: { code: 'Monitor', nameRu: 'Мониторинг', color: '#f59e0b' },
      defenseTools: ['SIEM', 'IDS/IPS', 'EDR', 'Anomaly detection'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
    { id: 4, code: 'RS', name: 'Respond', nameRu: 'Реагирование',
      description: 'Действия при обнаружении инцидента: план реагирования, коммуникация, анализ, сдерживание и смягчение.',
      attacker: ['Использование медленной реакции', 'Эскалация во время хаоса', 'Уничтожение улик'],
      defender: ['План реагирования (IR plan)', 'Сдерживание угрозы', 'Коммуникация и эскалация', 'Анализ инцидента'],
      metaphor: 'Пожарная команда, прибывшая по тревоге',
      defenseMethod: { code: 'Respond', nameRu: 'Реагирование', color: '#ef4444' },
      defenseTools: ['IR playbooks', 'SOAR', 'Forensics', 'Crisis comms'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
    { id: 5, code: 'RC', name: 'Recover', nameRu: 'Восстановление',
      description: 'Возврат к нормальной работе после инцидента: восстановление систем и данных, улучшения, коммуникация.',
      attacker: ['Атака на бэкапы', 'Повторное проникновение', 'Срыв восстановления'],
      defender: ['Резервное копирование', 'План восстановления (DRP)', 'Тестирование бэкапов', 'Уроки и улучшения'],
      metaphor: 'Восстановление дома после пожара — крепче прежнего',
      defenseMethod: { code: 'Restore', nameRu: 'Восстановление', color: '#a855f7' },
      defenseTools: ['Backup/DRP', 'BCP', 'Immutable backups', 'Post-mortem'],
      relatedCategory: 'Управление, риски и соответствие (GRC)' },
  ],
};

// ─── Incident Response (реагирование на инциденты) ─────────────────────────
const AR_IR = {
  title: 'Реагирование на инциденты',
  subtitle: '6 этапов обработки инцидента (SANS/NIST)',
  stages: [
    { id: 1, code: 'prep', name: 'Preparation', nameRu: 'Подготовка',
      description: 'Готовность к инцидентам заранее: политики, инструменты, обученная команда, плейбуки, резервные копии.',
      attacker: ['Атака на неготовую организацию', 'Использование отсутствия плана'],
      defender: ['IR-план и плейбуки', 'Обучение команды', 'Готовые инструменты', 'Резервные копии'],
      metaphor: 'Учения и огнетушители до пожара, а не во время',
      defenseMethod: { code: 'Prepare', nameRu: 'Подготовка', color: '#3b82f6' },
      defenseTools: ['IR plan', 'Playbooks', 'Tabletop exercises', 'Backups'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
    { id: 2, code: 'ident', name: 'Identification', nameRu: 'Обнаружение',
      description: 'Выявление и подтверждение инцидента: анализ сигналов, определение масштаба и типа угрозы.',
      attacker: ['Сокрытие активности', 'Ложные следы', 'Маскировка под легитимный трафик'],
      defender: ['Анализ алертов SIEM', 'Триаж событий', 'Определение масштаба', 'Классификация инцидента'],
      metaphor: 'Постановка диагноза по симптомам',
      defenseMethod: { code: 'Detect', nameRu: 'Обнаружение', color: '#f59e0b' },
      defenseTools: ['SIEM', 'EDR', 'Log analysis', 'Threat intel'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
    { id: 3, code: 'contain', name: 'Containment', nameRu: 'Сдерживание',
      description: 'Ограничение распространения угрозы: изоляция систем, блокировка учёток, краткосрочные и долгосрочные меры.',
      attacker: ['Боковое перемещение', 'Быстрое распространение', 'Закрепление до изоляции'],
      defender: ['Изоляция заражённых хостов', 'Блокировка учётных данных', 'Сегментация', 'Сохранение улик'],
      metaphor: 'Возведение стен вокруг очага возгорания',
      defenseMethod: { code: 'Isolate', nameRu: 'Изоляция', color: '#ef4444' },
      defenseTools: ['Network isolation', 'EDR containment', 'Firewall rules', 'Account lockout'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
    { id: 4, code: 'erad', name: 'Eradication', nameRu: 'Устранение',
      description: 'Удаление причины инцидента: вредоносного ПО, бэкдоров, скомпрометированных учёток, закрытие уязвимостей.',
      attacker: ['Скрытые бэкдоры', 'Повторное заражение', 'Резервные точки доступа'],
      defender: ['Удаление ВПО', 'Закрытие уязвимостей', 'Сброс учётных данных', 'Проверка чистоты'],
      metaphor: 'Полное тушение, чтобы не осталось тлеющих углей',
      defenseMethod: { code: 'Remove', nameRu: 'Устранение', color: '#a855f7' },
      defenseTools: ['Malware removal', 'Patching', 'Credential reset', 'Re-imaging'],
      relatedCategory: 'Реверс-инжиниринг и анализ вредоносного ПО' },
    { id: 5, code: 'recov', name: 'Recovery', nameRu: 'Восстановление',
      description: 'Возврат систем в работу: восстановление из чистых бэкапов, проверка, усиленный мониторинг.',
      attacker: ['Атака на этапе восстановления', 'Заражённые бэкапы'],
      defender: ['Восстановление из чистых копий', 'Проверка целостности', 'Усиленный мониторинг', 'Поэтапный возврат'],
      metaphor: 'Возвращение жильцов в отремонтированный дом',
      defenseMethod: { code: 'Restore', nameRu: 'Восстановление', color: '#10b981' },
      defenseTools: ['Clean backups', 'Validation', 'Enhanced monitoring'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
    { id: 6, code: 'lessons', name: 'Lessons Learned', nameRu: 'Выводы',
      description: 'Разбор инцидента: что произошло, как реагировали, что улучшить. Обновление плейбуков и защит.',
      attacker: ['Повторение успешной атаки', 'Эксплуатация неисправленных причин'],
      defender: ['Пост-мортем', 'Обновление плейбуков', 'Устранение коренных причин', 'Метрики реагирования'],
      metaphor: 'Разбор полётов, чтобы не повторить ошибок',
      defenseMethod: { code: 'Improve', nameRu: 'Улучшение', color: '#3b82f6' },
      defenseTools: ['Post-mortem', 'Root cause analysis', 'Playbook update'],
      relatedCategory: 'Управление, риски и соответствие (GRC)' },
  ],
};

// ─── Defense in Depth (эшелонированная защита) ─────────────────────────────
const AR_DID = {
  title: 'Эшелонированная защита',
  subtitle: 'Слои защиты Defense in Depth',
  stages: [
    { id: 1, code: 'phys', name: 'Physical', nameRu: 'Физический',
      description: 'Физическая безопасность: контроль доступа в помещения, охрана, видеонаблюдение, защита оборудования.',
      attacker: ['Проникновение в здание', 'Кража оборудования', 'Tailgating (проход за сотрудником)'],
      defender: ['Контроль доступа (СКУД)', 'Видеонаблюдение', 'Охрана', 'Защита серверных'],
      metaphor: 'Забор и ворота вокруг территории',
      defenseMethod: { code: 'Physical', nameRu: 'Физзащита', color: '#ef4444' },
      defenseTools: ['СКУД', 'CCTV', 'Биометрия', 'Замки'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 2, code: 'perim', name: 'Perimeter', nameRu: 'Периметр',
      description: 'Защита границы сети: межсетевые экраны, IPS, VPN, фильтрация трафика на входе и выходе.',
      attacker: ['Сканирование периметра', 'Эксплуатация открытых портов', 'Обход firewall'],
      defender: ['Firewall', 'IPS/IDS', 'VPN', 'Egress-фильтрация'],
      metaphor: 'Крепостная стена со рвом и стражей у ворот',
      defenseMethod: { code: 'Filter', nameRu: 'Фильтрация', color: '#f59e0b' },
      defenseTools: ['NGFW', 'IPS', 'WAF', 'VPN'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 3, code: 'net', name: 'Network', nameRu: 'Сеть',
      description: 'Защита внутренней сети: сегментация, микросегментация, мониторинг трафика, NAC.',
      attacker: ['Боковое перемещение', 'Сниффинг трафика', 'ARP-спуфинг'],
      defender: ['Сегментация сети (VLAN)', 'Микросегментация', 'NAC', 'Мониторинг трафика'],
      metaphor: 'Внутренние перегородки и двери между залами',
      defenseMethod: { code: 'Segment', nameRu: 'Сегментация', color: '#eab308' },
      defenseTools: ['VLAN', 'NAC', 'Zero Trust', 'NDR'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 4, code: 'host', name: 'Host', nameRu: 'Хост',
      description: 'Защита конечных устройств: антивирус, EDR, патчи, hardening, контроль приложений.',
      attacker: ['Эксплойты ОС', 'Вредоносное ПО', 'Эксплуатация непропатченных систем'],
      defender: ['EDR/антивирус', 'Патч-менеджмент', 'Hardening', 'Application control'],
      metaphor: 'Личный сейф в каждой комнате',
      defenseMethod: { code: 'Harden', nameRu: 'Усиление', color: '#84cc16' },
      defenseTools: ['EDR', 'Patch mgmt', 'CIS Benchmarks', 'AppLocker'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
    { id: 5, code: 'app', name: 'Application', nameRu: 'Приложение',
      description: 'Защита приложений: безопасная разработка, проверка ввода, аутентификация, тестирование безопасности.',
      attacker: ['Инъекции', 'XSS', 'Обход аутентификации', 'Логические уязвимости'],
      defender: ['Безопасная разработка (SSDLC)', 'Валидация ввода', 'SAST/DAST', 'WAF'],
      metaphor: 'Защищённый замок на каждом ящике стола',
      defenseMethod: { code: 'SecDev', nameRu: 'Безопасная разработка', color: '#10b981' },
      defenseTools: ['SAST/DAST', 'WAF', 'OWASP ASVS', 'Code review'],
      relatedCategory: 'Разработка безопасного ПО (AppSec)' },
    { id: 6, code: 'data', name: 'Data', nameRu: 'Данные',
      description: 'Защита самих данных: шифрование, контроль доступа, DLP, резервное копирование, классификация.',
      attacker: ['Кража данных', 'Несанкционированный доступ', 'Утечки через инсайдеров'],
      defender: ['Шифрование (at rest/in transit)', 'DLP', 'Контроль доступа', 'Резервное копирование'],
      metaphor: 'Драгоценность в сейфе внутри сейфа',
      defenseMethod: { code: 'Encrypt', nameRu: 'Шифрование', color: '#3b82f6' },
      defenseTools: ['Шифрование', 'DLP', 'IAM', 'Backup'],
      relatedCategory: 'Управление безопасностью данных' },
  ],
};

// ─── STRIDE (модель угроз) ─────────────────────────────────────────────────
const AR_STRIDE = {
  title: 'STRIDE',
  subtitle: 'Модель угроз для разработчиков',
  stages: [
    { id: 1, code: 'S', name: 'Spoofing', nameRu: 'Подмена личности',
      description: 'Выдача себя за другого пользователя или систему. Нарушает свойство аутентичности.',
      attacker: ['Кража учётных данных', 'Подмена токенов', 'Фишинг', 'Подделка идентификаторов'],
      defender: ['Сильная аутентификация (MFA)', 'Цифровые подписи', 'Защита сессий', 'Взаимная аутентификация (mTLS)'],
      metaphor: 'Самозванец в чужой форме и с чужим пропуском',
      defenseMethod: { code: 'Authn', nameRu: 'Аутентификация', color: '#ef4444' },
      defenseTools: ['MFA', 'mTLS', 'JWT-подписи', 'OAuth/OIDC'],
      relatedCategory: 'Криптография' },
    { id: 2, code: 'T', name: 'Tampering', nameRu: 'Изменение данных',
      description: 'Несанкционированное изменение данных или кода. Нарушает целостность.',
      attacker: ['Подмена данных в запросах', 'Изменение файлов', 'MITM-модификация трафика'],
      defender: ['Контроль целостности (хеши)', 'Цифровые подписи', 'TLS', 'Валидация ввода'],
      metaphor: 'Подделка цифр в подписанном договоре',
      defenseMethod: { code: 'Integrity', nameRu: 'Целостность', color: '#f59e0b' },
      defenseTools: ['HMAC', 'Цифровые подписи', 'TLS', 'Контроль целостности файлов'],
      relatedCategory: 'Разработка безопасного ПО (AppSec)' },
    { id: 3, code: 'R', name: 'Repudiation', nameRu: 'Отказ от действий',
      description: 'Пользователь отрицает совершённое действие, и нет доказательств обратного. Нарушает неотказуемость.',
      attacker: ['Удаление логов', 'Действия без аудита', 'Отрицание транзакций'],
      defender: ['Защищённый аудит-лог', 'Цифровые подписи действий', 'Неизменяемые логи', 'Таймстемпы'],
      metaphor: '«Это не я!» — а доказать нечем',
      defenseMethod: { code: 'Audit', nameRu: 'Аудит', color: '#eab308' },
      defenseTools: ['Audit logs', 'Цифровые подписи', 'WORM-хранилище', 'SIEM'],
      relatedCategory: 'Цифровая криминалистика и реагирование на инциденты (DFIR)' },
    { id: 4, code: 'I', name: 'Information Disclosure', nameRu: 'Раскрытие информации',
      description: 'Утечка конфиденциальной информации тем, кому она не предназначена. Нарушает конфиденциальность.',
      attacker: ['Перехват трафика', 'Доступ к чужим данным', 'Утечки через ошибки', 'Эксфильтрация'],
      defender: ['Шифрование', 'Контроль доступа', 'Минимизация данных в ответах', 'DLP'],
      metaphor: 'Секретные документы, оставленные на виду',
      defenseMethod: { code: 'Confid', nameRu: 'Конфиденциальность', color: '#10b981' },
      defenseTools: ['Шифрование', 'RBAC', 'DLP', 'Маскирование данных'],
      relatedCategory: 'Управление безопасностью данных' },
    { id: 5, code: 'D', name: 'Denial of Service', nameRu: 'Отказ в обслуживании',
      description: 'Нарушение доступности сервиса для легитимных пользователей. Нарушает доступность.',
      attacker: ['DDoS-атаки', 'Исчерпание ресурсов', 'Логические бомбы', 'Amplification'],
      defender: ['Rate limiting', 'Anti-DDoS защита', 'Масштабирование', 'Лимиты ресурсов'],
      metaphor: 'Толпа, заблокировавшая вход в магазин',
      defenseMethod: { code: 'Availab', nameRu: 'Доступность', color: '#3b82f6' },
      defenseTools: ['CDN/Anti-DDoS', 'Rate limiting', 'Auto-scaling', 'Load balancer'],
      relatedCategory: 'Сетевая архитектура и защита периметра (Defensive Blue Team)' },
    { id: 6, code: 'E', name: 'Elevation of Privilege', nameRu: 'Повышение привилегий',
      description: 'Получение прав выше положенных. Нарушает авторизацию.',
      attacker: ['Эксплойты для root/admin', 'Обход проверок прав', 'Манипуляция токенами'],
      defender: ['Принцип наименьших привилегий', 'Серверная проверка прав', 'Патчи', 'Sandbox'],
      metaphor: 'Рядовой, надевший генеральские погоны',
      defenseMethod: { code: 'Authz', nameRu: 'Авторизация', color: '#a855f7' },
      defenseTools: ['RBAC/ABAC', 'PoLP', 'Sandboxing', 'Patch mgmt'],
      relatedCategory: 'Разработка безопасного ПО (AppSec)' },
  ],
};

const AR_SCHEMES = {
  killchain: AR_KILL_CHAIN,
  owasp: AR_OWASP,
  osi: AR_OSI,
  mitre: AR_MITRE,
  nist: AR_NIST,
  ir: AR_IR,
  did: AR_DID,
  stride: AR_STRIDE,
};
let arActiveSchemeCode = 'killchain';
function activeScheme() { return AR_SCHEMES[arActiveSchemeCode] || AR_KILL_CHAIN; }

let arSelectedStage = null;  // id текущей раскрытой стадии (или null)
// Рендер схемы — пока заглушка, будет переписан в Итерации 2
let arViewMode = 'attack'; // 'attack' | 'defense'
function renderARScheme(schemeCode) {
  const container = document.getElementById('arSchemeContainer');
  if (!container) return;
  container.replaceChildren();
  arSelectedStage = null;

  if (!AR_SCHEMES[schemeCode]) {
    const unavailable = document.createElement('div');
    unavailable.setAttribute('data-static-style', 'a007');
    unavailable.textContent = 'Схема в разработке';
    container.replaceChildren(unavailable);
    return;
  }
  arActiveSchemeCode = schemeCode;

  if (schemeCode === 'killchain') renderKillChainScheme();
  else if (schemeCode === 'owasp')    renderOwaspScheme();
  else if (schemeCode === 'osi')      renderOsiScheme();
  else if (schemeCode === 'mitre')    renderMitreScheme();
  else if (schemeCode === 'nist')     renderNistScheme();
  else if (schemeCode === 'did')      renderDidScheme();
  else if (schemeCode === 'ir')       renderIrScheme();
  else if (schemeCode === 'stride')   renderStrideScheme();
  else                                 renderGenericScheme(AR_SCHEMES[schemeCode]);
}
// ─── OWASP: вертикальный стек с цветовой шкалой опасности ───────────────────
// 3D-фигуры на фоне AR-схем отключены — отвлекали от контента
const AR_3D = {
  cube: '',
  pyramid: '',
  layers: '',
  octa: '',
};

function renderOwaspScheme() {
  const container = document.getElementById('arSchemeContainer');
  const stages = AR_OWASP.stages;
  // Цвета по убыванию критичности: A01 самый опасный → красный, к A10 → жёлтый
  const colors = ['#ef4444','#f97316','#f97316','#f59e0b','#f59e0b',
                  '#eab308','#84cc16','#84cc16','#10b981','#3b82f6'];

  container.innerHTML = `
    <div id="arSchemeRoot" data-static-style="a008">
      ${AR_3D.pyramid}
      <div data-static-style="a009">
        <button data-onclick="zoomARScheme('in')" data-static-style="a010">+</button>
        <button data-onclick="zoomARScheme('out')" data-static-style="a010">−</button>
        <button data-onclick="resetARSchemeZoom()" data-static-style="a011">⟳</button>
      </div>
      <div id="killChainScrollContainer" data-static-style="a012">
        <div id="killChainWrapper" data-static-style="a013">
          <div id="killChainNodes" data-static-style="a014">
            ${stages.map((s, i) => {
              const color = colors[i] || '#3b82f6';
              return `<button data-onclick="selectKillChainStage(${s.id})" id="arNode${s.id}"
                data-dynamic-style="${dynamicStyleToken`display:flex;align-items:center;gap:12px;width:100%;padding:10px 14px;
                       background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);
                       border:1px solid ${color}44;border-left:4px solid ${color};
                       border-radius:10px;color:#fff;font-family:inherit;cursor:pointer;text-align:left;
                       transition:all 0.2s;pointer-events:auto;`}">
                <div data-dynamic-style="${dynamicStyleToken`width:36px;height:36px;border-radius:8px;background:${color}22;
                            border:1px solid ${color};color:${color};display:flex;align-items:center;
                            justify-content:center;font-weight:800;font-size:13px;flex-shrink:0;`}">A${String(s.id).padStart(2,'0')}</div>
                <div data-static-style="a015">
                  <div data-static-style="a016">${eh(s.nameRu)}</div>
                  <div data-static-style="a017">${eh(s.name)}</div>
                </div>
                <div data-dynamic-style="${dynamicStyleToken`width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;`}"></div>
              </button>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div id="arStageDetails" class="ar-stage-details-panel" data-static-style="a018">
        <div data-static-style="a019">
          <div data-static-style="a020"></div>
          <button data-onclick="toggleStageDetailsPanel()" data-args="event" title="Развернуть/свернуть" data-static-style="a021" id="arStageToggleBtn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" data-static-style="a022"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <div data-static-style="a023" id="arStageDetailTitle">НАЖМИТЕ НА УЯЗВИМОСТЬ</div>
        </div>
        <div id="arStageDetailContent" data-static-style="a024"></div>
      </div>
      <div id="arStageHint" data-static-style="a025">Нажми на уязвимость, чтобы узнать подробнее</div>
    </div>`;
  initStageDetailsSwipe();
  initARPan();

  // Анимация: строки вылетают снизу одна за другой
  setTimeout(() => {
    stages.forEach((s, i) => {
      const node = document.getElementById('arNode' + s.id);
      if (!node) return;
      node.style.opacity = '0';
      node.style.transform = 'translateX(-32px)';
      setTimeout(() => {
        node.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1), border-color 0.2s';
        node.style.opacity = '1';
        node.style.transform = 'translateX(0)';
      }, i * 60);
    });
  }, 50);
}

// ─── OSI: горизонтальные слои-плашки (L7 сверху, L1 снизу) ──────────────────
// ─── Универсальный рендер для линейных схем (NIST, IR, Defense in Depth, STRIDE) ───
// ─── NIST CSF: круговой цикл из 5 функций (SVG-кольцо) ──────────────────────
function renderNistScheme() {
  const container = document.getElementById('arSchemeContainer');
  if (!container) return;
  const scheme = AR_NIST;
  const stages = scheme.stages;
  const n = stages.length; // 5

  // Геометрия кольца
  const cx = 150, cy = 150, rOuter = 130, rInner = 70;
  const gap = 0.04; // зазор между сегментами (рад)
  const seg = (Math.PI * 2) / n;

  function polar(r, a) {
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  // Дуга-сегмент (кольцевой сектор) как SVG path
  function segmentPath(i) {
    const a0 = -Math.PI / 2 + i * seg + gap / 2;
    const a1 = -Math.PI / 2 + (i + 1) * seg - gap / 2;
    const [x0o, y0o] = polar(rOuter, a0);
    const [x1o, y1o] = polar(rOuter, a1);
    const [x1i, y1i] = polar(rInner, a1);
    const [x0i, y0i] = polar(rInner, a0);
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    return `M ${x0o} ${y0o} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 ${large} 0 ${x0i} ${y0i} Z`;
  }
  // Позиция подписи (середина сегмента)
  function labelPos(i) {
    const am = -Math.PI / 2 + (i + 0.5) * seg;
    return polar((rOuter + rInner) / 2, am);
  }

  const segs = stages.map((s, i) => {
    const color = (s.defenseMethod && s.defenseMethod.color) || '#3b82f6';
    const [lx, ly] = labelPos(i);
    return `
      <path id="nistSeg${s.id}" d="${segmentPath(i)}" fill="${color}" fill-opacity="0.22"
            stroke="${color}" stroke-width="2"
            data-dynamic-style="${dynamicStyleToken`cursor:pointer;transition:fill-opacity 0.25s, transform 0.4s cubic-bezier(0.22,1,0.36,1);transform-origin:${cx}px ${cy}px;opacity:0;`}"
            data-onclick="selectKillChainStage(${s.id})"></path>
      <text x="${lx}" y="${ly + 5}" text-anchor="middle" fill="#fff" font-size="15" font-weight="800"
            data-static-style="a026">${s.code}</text>`;
  }).join('');

  // Стрелки направления цикла (по часовой) — маленькие треугольники между сегментами
  const arrows = stages.map((s, i) => {
    const aEnd = -Math.PI / 2 + (i + 1) * seg;
    const [ax, ay] = polar(rOuter + 12, aEnd);
    const rot = (aEnd * 180 / Math.PI) + 90;
    return `<text x="${ax}" y="${ay}" text-anchor="middle" fill="rgba(0,212,255,0.6)" font-size="12"
              data-static-style="a027" transform="rotate(${rot} ${ax} ${ay})">▶</text>`;
  }).join('');

  container.innerHTML = `
    <div id="arSchemeRoot" data-static-style="a008">
      <div data-static-style="a009">
        <button data-onclick="zoomARScheme('in')" data-static-style="a028">+</button>
        <button data-onclick="zoomARScheme('out')" data-static-style="a028">−</button>
        <button data-onclick="resetARSchemeZoom()" data-static-style="a029">⟳</button>
      </div>
      <div id="killChainScrollContainer" data-static-style="a030">
        <div id="killChainNodes" data-static-style="a031">
          <svg width="300" height="300" viewBox="0 0 300 300" data-static-style="a032">
            <circle cx="${cx}" cy="${cy}" r="${rInner - 6}" fill="rgba(0,212,255,0.06)" stroke="rgba(0,212,255,0.4)" stroke-width="1.5"/>
            <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="#00d4ff" font-size="20" font-weight="800" data-static-style="a033">NIST</text>
            <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-size="11" data-static-style="a033">CSF</text>
            <g id="nistArrows" data-static-style="a034">${arrows}</g>
            ${segs}
          </svg>
        </div>
      </div>
      <div id="arStageDetails" class="ar-stage-details-panel" data-static-style="a035">
        <div data-static-style="a036">
          <div data-static-style="a020"></div>
          <button data-onclick="toggleStageDetailsPanel()" data-args="event" title="Развернуть/свернуть" data-static-style="a021" id="arStageToggleBtn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" data-static-style="a022"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <div data-static-style="a037" id="arStageDetailTitle">НАЖМИТЕ НА ФУНКЦИЮ</div>
        </div>
        <div id="arStageDetailContent" data-static-style="a024"></div>
      </div>
      <div id="arStageHint" data-static-style="a025">Нажми на функцию цикла, чтобы узнать подробнее</div>
    </div>`;

  initStageDetailsSwipe();
  initARPan();

  // Анимация: сегменты «раскрываются» по очереди (масштаб + прозрачность), затем появляются стрелки цикла
  setTimeout(() => {
    stages.forEach((s, i) => {
      const el = document.getElementById('nistSeg' + s.id);
      if (!el) return;
      el.style.transform = 'scale(0.6)';
      setTimeout(() => {
        el.style.opacity = '1';
        el.style.transform = 'scale(1)';
      }, i * 130);
    });
    const arrowsEl = document.getElementById('nistArrows');
    if (arrowsEl) setTimeout(() => { arrowsEl.style.opacity = '1'; }, n * 130 + 200);
  }, 60);
}

// ─── Defense in Depth: концентрические кольца (эшелоны вокруг данных) ───────
function renderDidScheme() {
  const container = document.getElementById('arSchemeContainer');
  if (!container) return;
  const scheme = AR_DID;
  const stages = scheme.stages; // 6: phys, perim, net, host, app, data
  const n = stages.length;
  const cx = 160, cy = 160;
  const rMax = 150, rMin = 34;
  // равномерные кольца от внешнего к внутреннему
  const step = (rMax - rMin) / n;

  // Внешний слой (stages[0]) — самое большое кольцо, данные (последний) — центр
  const rings = stages.map((s, i) => {
    const rOuter = rMax - i * step;
    const rInner = rMax - (i + 1) * step;
    const color = (s.defenseMethod && s.defenseMethod.color) || '#3b82f6';
    const isCenter = i === n - 1;
    const labelR = isCenter ? 0 : (rOuter + rInner) / 2;
    return { s, i, rOuter, rInner, color, isCenter, labelR };
  });

  // Рисуем от внешнего к внутреннему (большие сзади)
  const circles = rings.map(({ s, rOuter, color, isCenter }) => {
    if (isCenter) {
      return `<circle id="didRing${s.id}" cx="${cx}" cy="${cy}" r="${rOuter}"
        fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="2"
        data-static-style="a038"
        data-onclick="selectKillChainStage(${s.id})"></circle>`;
    }
    return `<circle id="didRing${s.id}" cx="${cx}" cy="${cy}" r="${rOuter}"
      fill="${color}" fill-opacity="0.10" stroke="${color}" stroke-width="2"
      data-static-style="a038"
      data-onclick="selectKillChainStage(${s.id})"></circle>`;
  }).join('');

  // Подписи слоёв — по верхней части каждого кольца
  const labels = rings.map(({ s, rOuter, rInner, color, isCenter }) => {
    if (isCenter) {
      return `<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#fff" font-size="12" font-weight="800"
        data-static-style="a026">${s.nameRu}</text>`;
    }
    const ly = cy - (rOuter + rInner) / 2 + 4;
    return `<text x="${cx}" y="${ly}" text-anchor="middle" fill="#fff" font-size="10" font-weight="700"
      data-static-style="a026">${s.nameRu}</text>`;
  }).join('');

  container.innerHTML = `
    <div id="arSchemeRoot" data-static-style="a008">
      <div data-static-style="a009">
        <button data-onclick="zoomARScheme('in')" data-static-style="a028">+</button>
        <button data-onclick="zoomARScheme('out')" data-static-style="a028">−</button>
        <button data-onclick="resetARSchemeZoom()" data-static-style="a029">⟳</button>
      </div>
      <div id="killChainScrollContainer" data-static-style="a030">
        <div id="killChainNodes" data-static-style="a031">
          <svg width="320" height="320" viewBox="0 0 320 320" data-static-style="a039">
            ${circles}
            ${labels}
          </svg>
        </div>
      </div>
      <div id="arStageDetails" class="ar-stage-details-panel" data-static-style="a035">
        <div data-static-style="a036">
          <div data-static-style="a020"></div>
          <button data-onclick="toggleStageDetailsPanel()" data-args="event" title="Развернуть/свернуть" data-static-style="a021" id="arStageToggleBtn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" data-static-style="a022"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <div data-static-style="a037" id="arStageDetailTitle">НАЖМИТЕ НА СЛОЙ</div>
        </div>
        <div id="arStageDetailContent" data-static-style="a024"></div>
      </div>
      <div id="arStageHint" data-static-style="a025">Нажми на слой защиты, чтобы узнать подробнее</div>
    </div>`;

  initStageDetailsSwipe();
  initARPan();

  // Анимация: кольца появляются от внешнего к внутреннему
  setTimeout(() => {
    rings.forEach(({ s }, idx) => {
      const el = document.getElementById('didRing' + s.id);
      if (!el) return;
      setTimeout(() => { el.style.opacity = '1'; }, idx * 120);
    });
  }, 60);
}

// ─── Incident Response: вертикальный таймлайн вех ──────────────────────────

function _createArSchemeShell({
  scrollStyle,
  nodesStyle,
  title,
  hint,
  wrapperStyle = null,
}) {
  const container = document.getElementById('arSchemeContainer');
  if (!container) return null;

  const controls = _arDetailNode('div', { staticStyle: 'a009' }, [
    _arDetailNode('button', { staticStyle: 'a028', text: '+', onClick: () => zoomARScheme('in') }),
    _arDetailNode('button', { staticStyle: 'a028', text: '−', onClick: () => zoomARScheme('out') }),
    _arDetailNode('button', { staticStyle: 'a029', text: '⟳', onClick: resetARSchemeZoom }),
  ]);

  const nodes = _arDetailNode('div', { id: 'killChainNodes', staticStyle: nodesStyle });
  let scrollChild = nodes;
  if (wrapperStyle) {
    scrollChild = _arDetailNode('div', {
      id: 'killChainWrapper',
      staticStyle: wrapperStyle,
    }, [nodes]);
  }
  const scroll = _arDetailNode('div', {
    id: 'killChainScrollContainer',
    staticStyle: scrollStyle,
  }, [scrollChild]);

  const toggleIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  toggleIcon.setAttribute('width', '18');
  toggleIcon.setAttribute('height', '18');
  toggleIcon.setAttribute('viewBox', '0 0 24 24');
  toggleIcon.setAttribute('fill', 'none');
  toggleIcon.setAttribute('stroke', 'currentColor');
  toggleIcon.setAttribute('stroke-width', '2.5');
  toggleIcon.setAttribute('stroke-linecap', 'round');
  toggleIcon.setAttribute('stroke-linejoin', 'round');
  toggleIcon.dataset.staticStyle = 'a022';
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  chevron.setAttribute('points', '18 15 12 9 6 15');
  toggleIcon.appendChild(chevron);

  const toggle = _arDetailNode('button', {
    id: 'arStageToggleBtn',
    staticStyle: 'a021',
    onClick: toggleStageDetailsPanel,
  }, [toggleIcon]);
  toggle.title = 'Развернуть/свернуть';

  const details = _arDetailNode('div', {
    id: 'arStageDetails',
    className: 'ar-stage-details-panel',
    staticStyle: 'a035',
  }, [
    _arDetailNode('div', { staticStyle: 'a036' }, [
      _arDetailNode('div', { staticStyle: 'a020' }),
      toggle,
      _arDetailNode('div', {
        id: 'arStageDetailTitle',
        staticStyle: 'a037',
        text: title,
      }),
    ]),
    _arDetailNode('div', { id: 'arStageDetailContent', staticStyle: 'a024' }),
  ]);

  const root = _arDetailNode('div', { id: 'arSchemeRoot', staticStyle: 'a008' }, [
    controls,
    scroll,
    details,
    _arDetailNode('div', { id: 'arStageHint', staticStyle: 'a025', text: hint }),
  ]);
  container.replaceChildren(root);
  return nodes;
}

function renderIrScheme() {
  const stages = AR_IR.stages;
  const nodes = _createArSchemeShell({
    scrollStyle: 'a044',
    nodesStyle: 'a045',
    title: 'НАЖМИТЕ НА ЭТАП',
    hint: 'Нажми на этап реагирования, чтобы узнать подробнее',
  });
  if (!nodes) return;

  stages.forEach((stage, index) => {
    const color = (stage.defenseMethod && stage.defenseMethod.color) || '#3b82f6';
    const timeline = _arDetailNode('div', { staticStyle: 'a041' });
    timeline.appendChild(_arDetailNode('div', {
      id: 'arNode' + stage.id,
      dynamicStyle: dynamicStyleToken`width:36px;height:36px;border-radius:50%;background:${color}22;border:2px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;cursor:pointer;flex-shrink:0;transition:all 0.25s;z-index:2;`,
      text: index + 1,
      onClick: () => selectKillChainStage(stage.id),
    }));
    if (index < stages.length - 1) {
      const nextColor = (stages[index + 1].defenseMethod && stages[index + 1].defenseMethod.color) || color;
      timeline.appendChild(_arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`flex:1;width:2px;background:linear-gradient(${color},${nextColor});min-height:24px;opacity:0.5;`,
      }));
    }

    const card = _arDetailNode('button', {
      id: 'arCard' + stage.id,
      dynamicStyle: dynamicStyleToken`flex:1;text-align:left;margin-bottom:14px;padding:12px 14px;background:rgba(0,0,0,0.6);backdrop-filter:blur(10px);border:1px solid ${color}44;border-left:3px solid ${color};border-radius:10px;color:#fff;font-family:inherit;cursor:pointer;transition:all 0.2s;opacity:0;transform:translateX(20px);`,
      onClick: () => selectKillChainStage(stage.id),
    }, [
      _arDetailNode('div', { staticStyle: 'a042', text: stage.nameRu }),
      _arDetailNode('div', { staticStyle: 'a043', text: stage.name }),
    ]);
    nodes.appendChild(_arDetailNode('div', { staticStyle: 'a040' }, [timeline, card]));
  });

  initStageDetailsSwipe();
  initARPan();
  setTimeout(() => {
    stages.forEach((stage, index) => {
      const card = document.getElementById('arCard' + stage.id);
      if (!card) return;
      setTimeout(() => {
        card.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1)';
        card.style.opacity = '1';
        card.style.transform = 'translateX(0)';
      }, index * 90);
    });
  }, 60);
}

// ─── STRIDE: сетка 2×3 карточек категорий угроз ────────────────────────────
function renderStrideScheme() {
  const stages = AR_STRIDE.stages;
  const nodes = _createArSchemeShell({
    scrollStyle: 'a048',
    nodesStyle: 'a049',
    title: 'НАЖМИТЕ НА КАТЕГОРИЮ',
    hint: 'Нажми на категорию угроз, чтобы узнать подробнее',
  });
  if (!nodes) return;

  stages.forEach(stage => {
    const color = (stage.defenseMethod && stage.defenseMethod.color) || '#3b82f6';
    nodes.appendChild(_arDetailNode('button', {
      id: 'arCard' + stage.id,
      dynamicStyle: dynamicStyleToken`position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;aspect-ratio:1;padding:12px 8px;background:rgba(0,0,0,0.6);backdrop-filter:blur(10px);border:1px solid ${color}55;border-radius:14px;color:#fff;font-family:inherit;cursor:pointer;transition:all 0.25s;overflow:hidden;opacity:0;transform:scale(0.8);`,
      onClick: () => selectKillChainStage(stage.id),
    }, [
      _arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`position:absolute;top:-10px;right:-6px;font-size:64px;font-weight:900;color:${color};opacity:0.13;line-height:1;`,
        text: stage.code,
      }),
      _arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`width:42px;height:42px;border-radius:12px;background:${color}22;border:1.5px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:20px;margin-bottom:8px;z-index:1;`,
        text: stage.code,
      }),
      _arDetailNode('div', { staticStyle: 'a046', text: stage.nameRu }),
      _arDetailNode('div', { staticStyle: 'a047', text: stage.name }),
    ]));
  });

  initStageDetailsSwipe();
  initARPan();
  setTimeout(() => {
    stages.forEach((stage, index) => {
      const card = document.getElementById('arCard' + stage.id);
      if (!card) return;
      setTimeout(() => {
        card.style.transition = 'opacity 0.3s ease, transform 0.4s cubic-bezier(0.22,1,0.36,1)';
        card.style.opacity = '1';
        card.style.transform = 'scale(1)';
      }, index * 80);
    });
  }, 60);
}

function renderGenericScheme(scheme) {
  if (!scheme) return;
  const stages = scheme.stages;
  const nodes = _createArSchemeShell({
    scrollStyle: 'a012',
    wrapperStyle: 'a013',
    nodesStyle: 'a014',
    title: 'НАЖМИТЕ НА ЭТАП',
    hint: 'Нажми на этап, чтобы узнать подробнее',
  });
  if (!nodes) return;

  stages.forEach(stage => {
    const color = (stage.defenseMethod && stage.defenseMethod.color) || '#3b82f6';
    const badge = (stage.code || String(stage.id)).toUpperCase().slice(0, 4);
    nodes.appendChild(_arDetailNode('button', {
      id: 'arNode' + stage.id,
      dynamicStyle: dynamicStyleToken`display:flex;align-items:center;gap:12px;width:100%;padding:10px 14px;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);border:1px solid ${color}44;border-left:4px solid ${color};border-radius:10px;color:#fff;font-family:inherit;cursor:pointer;text-align:left;transition:all 0.2s;pointer-events:auto;`,
      onClick: () => selectKillChainStage(stage.id),
    }, [
      _arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`width:40px;height:36px;border-radius:8px;background:${color}22;border:1px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0;`,
        text: badge,
      }),
      _arDetailNode('div', { staticStyle: 'a015' }, [
        _arDetailNode('div', { staticStyle: 'a050', text: stage.nameRu }),
        _arDetailNode('div', { staticStyle: 'a051', text: stage.name }),
      ]),
      _arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;`,
      }),
    ]));
  });

  initStageDetailsSwipe();
  initARPan();
  setTimeout(() => {
    stages.forEach((stage, index) => {
      const node = document.getElementById('arNode' + stage.id);
      if (!node) return;
      node.style.opacity = '0';
      node.style.transform = 'translateX(-32px)';
      setTimeout(() => {
        node.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1), border-color 0.2s';
        node.style.opacity = '1';
        node.style.transform = 'translateX(0)';
      }, index * 60);
    });
  }, 50);
}

// ─── OSI: стопка из 7 слоёв (уровень 7 сверху, уровень 1 снизу) ────────────
function renderOsiScheme() {
  const container = document.getElementById('arSchemeContainer');
  if (!container) return;
  const scheme = AR_OSI;
  // Отображаем сверху вниз: L7 (Приложение) наверху → L1 (Физический) внизу
  const stages = scheme.stages.slice().reverse();

  const layers = stages.map((s, idx) => {
    const color = (s.defenseMethod && s.defenseMethod.color) || '#3b82f6';
    const num = s.id; // оригинальный номер уровня
    return `
      <button data-onclick="selectKillChainStage(${s.id})" id="arNode${s.id}"
        data-dynamic-style="${dynamicStyleToken`display:flex;align-items:center;gap:14px;width:100%;padding:14px 16px;
               background:linear-gradient(135deg, ${color}33, ${color}11);
               backdrop-filter:blur(10px);border:1px solid ${color}66;border-radius:10px;
               color:#fff;font-family:inherit;cursor:pointer;text-align:left;transition:all 0.25s;
               box-shadow:0 4px 14px ${color}22;opacity:0;transform:translateY(-16px);`}">
        <div data-dynamic-style="${dynamicStyleToken`width:44px;height:44px;border-radius:10px;background:${color}33;border:1.5px solid ${color};
                    color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;
                    flex-shrink:0;line-height:1;`}">
          <div data-static-style="a052">LVL</div>
          <div data-static-style="a053">${num}</div>
        </div>
        <div data-static-style="a015">
          <div data-static-style="a042">${s.nameRu}</div>
          <div data-static-style="a054">${s.name}</div>
        </div>
        <div data-dynamic-style="${dynamicStyleToken`width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 8px ${color};`}"></div>
      </button>`;
  }).join('');

  container.innerHTML = `
    <div id="arSchemeRoot" data-static-style="a008">
      <div data-static-style="a009">
        <button data-onclick="zoomARScheme('in')" data-static-style="a028">+</button>
        <button data-onclick="zoomARScheme('out')" data-static-style="a028">−</button>
        <button data-onclick="resetARSchemeZoom()" data-static-style="a029">⟳</button>
      </div>
      <div id="killChainScrollContainer" data-static-style="a044">
        <div id="killChainNodes" data-static-style="a055">
          <div data-static-style="a056">▲ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ</div>
          ${layers}
          <div data-static-style="a057">ФИЗИЧЕСКАЯ СРЕДА ▼</div>
        </div>
      </div>
      <div id="arStageDetails" class="ar-stage-details-panel" data-static-style="a035">
        <div data-static-style="a036">
          <div data-static-style="a020"></div>
          <button data-onclick="toggleStageDetailsPanel()" data-args="event" title="Развернуть/свернуть" data-static-style="a021" id="arStageToggleBtn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" data-static-style="a022"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <div data-static-style="a037" id="arStageDetailTitle">НАЖМИТЕ НА УРОВЕНЬ</div>
        </div>
        <div id="arStageDetailContent" data-static-style="a024"></div>
      </div>
      <div id="arStageHint" data-static-style="a025">Нажми на уровень модели, чтобы узнать подробнее</div>
    </div>`;

  initStageDetailsSwipe();
  initARPan();

  // Анимация: слои «складываются» сверху вниз
  setTimeout(() => {
    stages.forEach((s, i) => {
      const el = document.getElementById('arNode' + s.id);
      if (!el) return;
      setTimeout(() => {
        el.style.transition = 'opacity 0.3s ease, transform 0.4s cubic-bezier(0.22,1,0.36,1)';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, i * 80);
    });
  }, 60);
}

// ─── MITRE: матрица тактик 2 колонки с цветовой кодировкой фаз ───────────────
// ─── MITRE ATT&CK: горизонтальная лента тактик (путь атаки) ────────────────
function renderMitreScheme() {
  const container = document.getElementById('arSchemeContainer');
  if (!container) return;
  const scheme = AR_MITRE;
  const stages = scheme.stages; // 14 тактик

  // Градиент опасности: от синего (разведка) к красному (воздействие)
  function dangerColor(i, total) {
    const t = i / (total - 1);
    const hue = 200 - t * 200; // 200 (синий) → 0 (красный)
    return `hsl(${hue}, 70%, 55%)`;
  }

  const cards = stages.map((s, i) => {
    const color = dangerColor(i, stages.length);
    const isLast = i === stages.length - 1;
    return `
      <div data-static-style="a058">
        <button data-onclick="selectKillChainStage(${s.id})" id="arNode${s.id}"
          data-dynamic-style="${dynamicStyleToken`width:130px;min-height:120px;display:flex;flex-direction:column;align-items:flex-start;
                 padding:12px;background:rgba(0,0,0,0.65);backdrop-filter:blur(10px);
                 border:1px solid ${color}66;border-top:3px solid ${color};border-radius:12px;
                 color:#fff;font-family:inherit;cursor:pointer;text-align:left;transition:all 0.25s;
                 flex-shrink:0;opacity:0;transform:translateY(16px);`}">
          <div data-static-style="a059">
            <div data-dynamic-style="${dynamicStyleToken`width:26px;height:26px;border-radius:7px;background:${color}33;border:1px solid ${color};
                        color:${color};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex-shrink:0;`}">${i + 1}</div>
            <div data-static-style="a060">${s.code}</div>
          </div>
          <div data-static-style="a061">${s.nameRu}</div>
          <div data-static-style="a062">${s.name}</div>
        </button>
        ${isLast ? '' : `<div data-dynamic-style="${dynamicStyleToken`color:${color};font-size:18px;margin:0 4px;flex-shrink:0;opacity:0.7;`}">→</div>`}
      </div>`;
  }).join('');

  container.innerHTML = `
    <div id="arSchemeRoot" data-static-style="a008">
      <div data-static-style="a009">
        <button data-onclick="zoomARScheme('in')" data-static-style="a028">+</button>
        <button data-onclick="zoomARScheme('out')" data-static-style="a028">−</button>
        <button data-onclick="resetARSchemeZoom()" data-static-style="a029">⟳</button>
      </div>
      <div data-static-style="a063">РАЗВЕДКА ──────▶ ВОЗДЕЙСТВИЕ (листай вбок)</div>
      <div id="killChainScrollContainer" data-static-style="a064">
        <div id="killChainNodes" data-static-style="a065">
          ${cards}
        </div>
      </div>
      <div id="arStageDetails" class="ar-stage-details-panel" data-static-style="a035">
        <div data-static-style="a036">
          <div data-static-style="a020"></div>
          <button data-onclick="toggleStageDetailsPanel()" data-args="event" title="Развернуть/свернуть" data-static-style="a021" id="arStageToggleBtn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" data-static-style="a022"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <div data-static-style="a037" id="arStageDetailTitle">НАЖМИТЕ НА ТАКТИКУ</div>
        </div>
        <div id="arStageDetailContent" data-static-style="a024"></div>
      </div>
      <div id="arStageHint" data-static-style="a025">Нажми на тактику атаки, чтобы узнать подробнее</div>
    </div>`;

  initStageDetailsSwipe();
  initARPan();

  // Анимация: карточки появляются слева направо
  setTimeout(() => {
    stages.forEach((s, i) => {
      const el = document.getElementById('arNode' + s.id);
      if (!el) return;
      setTimeout(() => {
        el.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.22,1,0.36,1)';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, i * 55);
    });
  }, 60);
}
function findKillChainStageForBook(book) {
  // Ищем первую категорию книги, которая привязана к этапу Kill Chain
  const cats = (book && book.categories) || [];
  for (const cat of cats) {
    const stage = activeScheme().stages.find(s => s.relatedCategory === cat);
    if (stage) return stage;
  }
  return null;
}
// Считается, что этап «изучен», если у юзера есть хотя бы одна книга
// из соответствующей категории со статусом completed
function isKillChainStageStudied(stage) {
  if (!state.currentUser || !state.books || !state.mylist) return false;
  const completedBookIds = Object.entries(state.mylist)
    .filter(([, status]) => status === 'completed')
    .map(([id]) => parseInt(id));
  if (completedBookIds.length === 0) return false;
  return state.books.some(b =>
    (b.categories || []).includes(stage.relatedCategory) && completedBookIds.includes(b.id)
  );
}

function renderKillChainScheme() {
  // Показываем переключатель режима (он скрыт по умолчанию для других схем)
  const toggle = document.getElementById('arViewModeToggle');
  if (toggle) toggle.style.display = 'flex';
  // Восстанавливаем сохранённый режим
  const savedMode = localStorage.getItem('aegis_killchain_mode') || 'attack';
  arViewMode = savedMode;
  // Применим режим после рендера узлов (через тик)
  setTimeout(() => setKillChainViewMode(savedMode), 50);
  const container = document.getElementById('arSchemeContainer');
  if (!container) {
    console.error('arSchemeContainer не найден');
    return;
  }
  
  const stages = activeScheme().stages;
  
  // Определяем ориентацию
  const isMobile = window.innerWidth < 768;
  const isPortrait = window.innerHeight > window.innerWidth;
  const isVertical = true; // Kill Chain всегда вертикальный (по запросу)
  
  // Сбрасываем зум при открытии
  currentARSchemeZoom = 1;
  
  let html = `
    <div id="arSchemeRoot" data-static-style="a066">
      ${AR_3D.cube}
      
      <!-- Контролы зума -->
      <div data-static-style="a009">
        <button data-onclick="zoomARScheme('in')" data-static-style="a067">+</button>
        <button data-onclick="zoomARScheme('out')" data-static-style="a067">−</button>
        <button data-onclick="resetARSchemeZoom()" data-static-style="a068">⟳</button>
      </div>
      
      <!-- Контейнер для скролла с поддержкой зума -->
      <div id="killChainScrollContainer" data-static-style="a069">
        <div id="killChainWrapper" data-static-style="a013">
          <div id="killChainNodes" data-dynamic-style="${dynamicStyleToken`display:flex;flex-direction:${isVertical ? 'column' : 'row'};align-items:center;justify-content:center;gap:${isVertical ? '12px' : '8px'};transition:transform 0.2s ease;transform-origin:center center;`}">
            ${stages.map((s, i) => `
              ${i > 0 ? `<div class="ar-chain-link${isVertical ? ' vertical' : ''}" data-dynamic-style="${dynamicStyleToken`width:${isVertical ? '16px' : '28px'};height:${isVertical ? '28px' : '16px'};border:3px solid rgba(0,212,255,0.45);border-radius:50%;flex-shrink:0;margin:${isVertical ? '-6px 0' : '0 -6px'};box-shadow:0 0 8px rgba(0,212,255,0.2),inset 0 0 4px rgba(0,0,0,0.4);`}"></div>` : ''}
              ${(() => {
                const studied = isKillChainStageStudied(s);
                const borderColor = studied ? '#10b981' : 'rgba(0,212,255,0.5)';
                const checkmark = studied ? `<div data-static-style="a070">✓</div>` : '';
                return `
                <div data-static-style="a071">
                <button data-onclick="selectKillChainStage(${s.id})" id="arNode${s.id}" class="ar-killchain-node" data-dynamic-style="${dynamicStyleToken`position:relative;width:${isVertical ? '76px' : '60px'};height:${isVertical ? '76px' : '60px'};border-radius:50%;background:radial-gradient(circle at 35% 30%, rgba(40,48,68,0.95), rgba(8,10,18,0.95));backdrop-filter:blur(10px);border:4px solid ${borderColor};color:#fff;font-family:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:all 0.2s;flex-shrink:0;padding:0;margin:${isVertical ? '4px 0 0' : '0'};box-shadow:0 0 16px ${studied ? 'rgba(16,185,129,0.4)' : 'rgba(0,212,255,0.3)'},inset 0 2px 6px rgba(255,255,255,0.15),inset 0 -3px 8px rgba(0,0,0,0.5);`}">
                  <div data-dynamic-style="${dynamicStyleToken`font-size:${isVertical ? '26px' : '20px'};font-weight:800;line-height:1;text-shadow:0 1px 3px rgba(0,0,0,0.6);`}">${s.id}</div>
                  ${checkmark}
                </button>
                <div data-static-style="a072">${s.nameRu}</div>
                </div>
                `;
              })()}
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Панель деталей этапа (с возможностью свайпа вверх) -->
      <div id="arStageDetails" class="ar-stage-details-panel" data-static-style="a073">
        <div data-static-style="a074">
          <div data-static-style="a020"></div>
          <button data-onclick="toggleStageDetailsPanel()" data-args="event" title="Развернуть/свернуть" data-static-style="a021" id="arStageToggleBtn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" data-static-style="a022"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <div data-static-style="a075" id="arStageDetailTitle">НАЖМИТЕ НА ЭТАП</div>
        </div>
        <div id="arStageDetailContent" data-static-style="a024">
          <!-- Содержимое будет подставлено -->
        </div>
      </div>
      
      <!-- Подсказка -->
      <div id="arStageHint" data-static-style="a025">
        Нажми на этап, чтобы узнать подробнее
      </div>
    </div>
  `;

  container.innerHTML = html;
  
  // Инициализируем свайп для панели деталей
  initStageDetailsSwipe();
  initARPan();
  
  if (isVertical) {
    setTimeout(() => {
      const scrollContainer = document.getElementById('killChainScrollContainer');
      if (scrollContainer && stages.length > 4) {
        const hint = document.createElement('div');
        hint.style.cssText = 'position:absolute;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.6);border-radius:20px;padding:6px 14px;font-size:10px;color:#fff;pointer-events:none;animation:fadeOut 2s forwards;z-index:15;';
        hint.textContent = '↓ Листай вниз ↓';
        document.getElementById('arSchemeRoot').appendChild(hint);
        setTimeout(() => hint.remove(), 2000);
      }
    }, 500);
  }

  // Анимация появления нод — каждая вылетает с задержкой
  setTimeout(() => {
    document.querySelectorAll('.ar-killchain-node').forEach((node, i) => {
      node.style.opacity = '0';
      node.style.transform = 'scale(0.5)';
      setTimeout(() => {
        node.style.transition = 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s';
        node.style.opacity = '1';
        node.style.transform = 'scale(1)';
      }, i * 80);
    });
    // Пульсирующий эффект на первой ноде как подсказка
    setTimeout(() => {
      const first = document.getElementById('arNode1');
      if (first) first.style.animation = 'arNodePulse 2s ease-in-out 3';
    }, stages.length * 80 + 200);

    // 3D floating анимация с разными задержками
    document.querySelectorAll('.ar-killchain-node').forEach((node, i) => {
      const delay = (i * 300) % 1200;
      const dur = 2.8 + (i % 3) * 0.4;
      setTimeout(() => {
        if (!node.style.animation || node.style.animation.includes('arNodePulse') === false) {
          node.style.animation = `ar3dFloat ${dur}s ease-in-out ${delay}ms infinite`;
        }
      }, stages.length * 80 + 800);
    });
  }, 100);
}

// Глобальные переменные для свайпа
let detailsPanelStartY = 0;
let detailsPanelCurrentY = 0;
let detailsPanelIsDragging = false;
let detailsPanelOpen = false;
let detailsPanelDidDrag = false;

// Панорамирование схемы: нативный скролл (тачпад/колесо) + drag мышью
function initARPan() {
  const sc = document.getElementById('killChainScrollContainer');
  if (!sc) return;
  // Колесо/тачпад: вертикальный жест → горизонтальная прокрутка ТОЛЬКО если
  // по горизонтали скроллить некуда нативно (узкий контент). Иначе не мешаем.
  sc.onwheel = (e) => {
    const canScrollV = sc.scrollHeight > sc.clientHeight;
    const canScrollH = sc.scrollWidth > sc.clientWidth;
    // Если контент шире, чем выше, и вертикально скроллить некуда — конвертим
    if (canScrollH && !canScrollV && e.deltaX === 0) {
      sc.scrollLeft += e.deltaY;
      e.preventDefault();
    }
    // во всех остальных случаях — нативный скролл (работает на тачпаде сам)
  };
  // Drag-to-pan мышью (для обычной мыши без колеса-горизонтали)
  let dragging = false, sx = 0, sy = 0, sl = 0, st = 0, moved = false;
  sc.onmousedown = (e) => {
    if (e.target.closest('button')) return;
    dragging = true; moved = false;
    sx = e.clientX; sy = e.clientY;
    sl = sc.scrollLeft; st = sc.scrollTop;
    sc.style.cursor = 'grabbing';
  };
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    sc.scrollLeft = sl - dx;
    sc.scrollTop = st - dy;
  });
  window.addEventListener('mouseup', () => { dragging = false; sc.style.cursor = ''; });
}

function initStageDetailsSwipe() {
  const panel = document.getElementById('arStageDetails');
  if (!panel) return;

  panel.removeEventListener('touchstart', onDetailsTouchStart);
  panel.removeEventListener('touchmove', onDetailsTouchMove);
  panel.removeEventListener('touchend', onDetailsTouchEnd);
  panel.removeEventListener('mousedown', onDetailsMouseDown);

  panel.addEventListener('touchstart', onDetailsTouchStart, { passive: false });
  panel.addEventListener('touchmove', onDetailsTouchMove, { passive: false });
  panel.addEventListener('touchend', onDetailsTouchEnd);
  panel.addEventListener('mousedown', onDetailsMouseDown);

  // Клик по панели (для ПК/тачпада): переключает открыто/закрыто.
  // Игнорируем клики по кнопкам и случаи, когда было перетаскивание.
  panel.removeEventListener('click', onDetailsClick);
  panel.addEventListener('click', onDetailsClick);
}

function toggleStageDetailsPanel(e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  const panel = document.getElementById('arStageDetails');
  if (!panel) { console.warn('AR: панель arStageDetails не найдена'); return; }
  if (getComputedStyle(panel).display === 'none') panel.style.display = 'block';
  panel.style.transition = 'transform 0.3s ease';
  const arrow = document.getElementById('arStageToggleBtn');
  const svg = arrow ? arrow.querySelector('svg') : null;

  const isDesktop = window.innerWidth >= 768;
  const xPart = isDesktop ? 'translateX(-50%) ' : '';

  // Определяем реальное состояние по положению панели на экране,
  // а не по флагу (флаг рассинхронизируется при выборе этапа).
  const rect = panel.getBoundingClientRect();
  const winH = window.innerHeight;
  // Если видимая часть панели меньше ~40% её высоты — считаем закрытой → открываем
  const visibleHeight = winH - rect.top;
  const isCurrentlyOpen = visibleHeight > rect.height * 0.55;
  const willOpen = !isCurrentlyOpen;

  if (willOpen) {
    panel.style.setProperty('transform', xPart + 'translateY(0px)', 'important');
  } else {
    const ph = panel.offsetHeight || 300;
    panel.style.setProperty('transform', xPart + `translateY(${ph - 60}px)`, 'important');
  }
  detailsPanelOpen = willOpen;
  if (svg) svg.style.transform = willOpen ? 'rotate(180deg)' : 'rotate(0deg)';
}

function onDetailsClick(e) {
  if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
  if (detailsPanelDidDrag) { detailsPanelDidDrag = false; return; } // это было перетаскивание
  const panel = document.getElementById('arStageDetails');
  if (!panel) return;
  panel.style.transition = 'transform 0.3s ease';
  if (detailsPanelOpen) {
    const ph = panel.offsetHeight;
    panel.style.transform = `translateY(${ph - 60}px)`;
    detailsPanelOpen = false;
  } else {
    panel.style.transform = 'translateY(0)';
    detailsPanelOpen = true;
  }
}

function onDetailsMouseDown(e) {
  // Игнорируем клики по кнопкам внутри панели
  if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
  detailsPanelStartY = e.clientY;
  detailsPanelIsDragging = true;
  const panel = document.getElementById('arStageDetails');
  if (panel) panel.style.transition = 'none';
  const onMove = (ev) => {
    if (!detailsPanelIsDragging) return;
    const p = document.getElementById('arStageDetails');
    if (!p) return;
    const delta = ev.clientY - detailsPanelStartY;
    if (Math.abs(delta) > 5) detailsPanelDidDrag = true;
    const ph = p.offsetHeight;
    const base = detailsPanelOpen ? 0 : ph - 60;
    const nt = Math.max(0, Math.min(base + delta, ph - 60));
    p.style.transform = `translateY(${nt}px)`;
    detailsPanelCurrentY = nt;
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    onDetailsTouchEnd({ touches: [] });
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function onDetailsTouchStart(e) {
  detailsPanelStartY = e.touches[0].clientY;
  detailsPanelIsDragging = true;
  const panel = document.getElementById('arStageDetails');
  if (panel) {
    panel.style.transition = 'none';
  }
}

function onDetailsTouchMove(e) {
  if (!detailsPanelIsDragging) return;
  e.preventDefault();
  
  const currentY = e.touches[0].clientY;
  const deltaY = currentY - detailsPanelStartY;
  const panel = document.getElementById('arStageDetails');
  if (!panel) return;
  
  const panelHeight = panel.offsetHeight;
  const currentTransform = detailsPanelOpen ? 0 : panelHeight - 60;
  let newTransform = currentTransform + deltaY;
  
  // Ограничиваем диапазон
  newTransform = Math.max(0, Math.min(newTransform, panelHeight - 60));
  
  panel.style.transform = `translateY(${newTransform}px)`;
  detailsPanelCurrentY = newTransform;
}

function onDetailsTouchEnd(e) {
  if (!detailsPanelIsDragging) return;
  detailsPanelIsDragging = false;
  
  const panel = document.getElementById('arStageDetails');
  if (!panel) return;
  
  const panelHeight = panel.offsetHeight;
  const threshold = panelHeight * 0.3;
  
  // Решаем, открыть или закрыть
  if (detailsPanelCurrentY < threshold) {
    // Открыть полностью
    panel.style.transform = 'translateY(0)';
    detailsPanelOpen = true;
  } else if (detailsPanelCurrentY > panelHeight - 60 - threshold) {
    // Закрыть до минимального размера
    panel.style.transform = `translateY(${panelHeight - 60}px)`;
    detailsPanelOpen = false;
  } else {
    // Вернуться к предыдущему состоянию
    if (detailsPanelOpen) {
      panel.style.transform = 'translateY(0)';
    } else {
      panel.style.transform = `translateY(${panelHeight - 60}px)`;
    }
  }
  
  panel.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
}
let currentARSchemeZoom = 1;
const AR_ZOOM_MIN = 0.5;
const AR_ZOOM_MAX = 2.5;

function zoomARScheme(direction) {
  const nodesContainer = document.getElementById('killChainNodes');
  if (!nodesContainer) return;

  if (direction === 'in') {
    currentARSchemeZoom = Math.min(currentARSchemeZoom + 0.15, AR_ZOOM_MAX);
  } else if (direction === 'out') {
    currentARSchemeZoom = Math.max(currentARSchemeZoom - 0.15, AR_ZOOM_MIN);
  }

  applyARSchemeZoom();
  showZoomIndicator(Math.round(currentARSchemeZoom * 100));
}

function applyARSchemeZoom() {
  // Меняем размеры всех нод и соединителей реальными CSS-свойствами,
  // а не transform: scale(). Это позволяет скроллу понимать новый размер.
  const isVertical = window.innerWidth < 768;
  const baseNodeSize = isVertical ? 80 : 64;
  const baseGap = isVertical ? 12 : 8;
  const baseConnectorMain = isVertical ? 24 : 24;       // длина по основной оси
  const baseConnectorCross = 2;                         // толщина
  const baseFontNum = isVertical ? 22 : 18;
  const baseFontLabel = isVertical ? 9 : 7;

  const z = currentARSchemeZoom;
  const nodeSize = Math.round(baseNodeSize * z);
  const gap = Math.round(baseGap * z);
  const connectorMain = Math.round(baseConnectorMain * z);
  const fontNum = Math.round(baseFontNum * z);
  const fontLabel = Math.round(baseFontLabel * z);

  const nodesContainer = document.getElementById('killChainNodes');
  if (nodesContainer) {
    nodesContainer.style.gap = gap + 'px';
    nodesContainer.style.transform = 'none';  // на всякий случай очищаем старый scale
  }

  // Обновляем все ноды
  activeScheme().stages.forEach(s => {
    const node = document.getElementById('arNode' + s.id);
    if (!node) return;
    node.style.width = nodeSize + 'px';
    node.style.height = nodeSize + 'px';
    const num = node.querySelector('div:first-child');
    const lbl = node.querySelector('div:last-child');
    if (num) num.style.fontSize = fontNum + 'px';
    if (lbl) lbl.style.fontSize = fontLabel + 'px';
  });

  // Обновляем соединители (тонкие линии между нодами)
  document.querySelectorAll('#killChainNodes > div:not([id])').forEach(c => {
    if (isVertical) {
      c.style.width = baseConnectorCross + 'px';
      c.style.height = connectorMain + 'px';
    } else {
      c.style.width = connectorMain + 'px';
      c.style.height = baseConnectorCross + 'px';
    }
  });
}
function resetARSchemeZoom() {
  currentARSchemeZoom = 1;
  const nodesContainer = document.getElementById('killChainNodes');
  const scrollContainer = document.getElementById('killChainScrollContainer');
  if (nodesContainer) {
    nodesContainer.style.transform = 'scale(1)';
    nodesContainer.style.transition = 'transform 0.2s ease';
  }
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
  }
  if (typeof applyARSchemeZoom === 'function') applyARSchemeZoom();
  showZoomIndicator(100);
}

function showZoomIndicator(percent) {
  const old = document.getElementById('zoomIndicator');
  if (old) old.remove();

  const indicator = document.createElement('div');
  indicator.id = 'zoomIndicator';
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(svgNamespace, 'svg');
  icon.setAttribute('width', '20');
  icon.setAttribute('height', '20');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('data-static-style', 'a076');

  const circle = document.createElementNS(svgNamespace, 'circle');
  circle.setAttribute('cx', '11');
  circle.setAttribute('cy', '11');
  circle.setAttribute('r', '8');
  icon.appendChild(circle);
  [
    ['21', '21', '16.65', '16.65'],
    ['11', '8', '11', '14'],
    ['8', '11', '14', '11'],
  ].forEach(([x1, y1, x2, y2]) => {
    const line = document.createElementNS(svgNamespace, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    icon.appendChild(line);
  });
  const label = document.createElement('span');
  label.textContent = `${Math.round(Number(percent) || 0)}%`;
  indicator.append(icon, label);
  indicator.style.cssText = `
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0,0,0,0.85);
    backdrop-filter: blur(12px);
    color: #00d4ff;
    font-size: 16px; font-weight: 700;
    padding: 10px 20px;
    border-radius: 48px;
    z-index: 100; pointer-events: none;
    font-family: 'JetBrains Mono', monospace;
    display: inline-flex; align-items: center;
    border: 1px solid rgba(0,212,255,0.3);
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    animation: zoomFadeOut 0.8s forwards;
  `;
  document.body.appendChild(indicator);
  setTimeout(() => indicator.remove(), 800);
}

// Добавляем анимацию для индикатора зума
const style = document.createElement('style');
style.textContent = `
  @keyframes zoomFadeOut {
    0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    70% { opacity: 0.8; }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
  }
  
  @keyframes fadeOut {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }
  
  .ar-killchain-node {
    transition: all 0.2s ease;
  }
  
  .ar-killchain-node:active {
    transform: scale(0.95);
  }
`;
document.head.appendChild(style);


function _arDetailNode(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);
  if (options.id) node.id = options.id;
  if (options.className) node.className = options.className;
  if (options.staticStyle) node.dataset.staticStyle = options.staticStyle;
  if (options.dynamicStyle) node.dataset.dynamicStyle = options.dynamicStyle;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.disabled) node.disabled = true;
  if (options.onClick) node.addEventListener('click', options.onClick);
  children.forEach(child => node.appendChild(child));
  return node;
}

function _arDetailTab(id, label, staticStyle) {
  return _arDetailNode('button', {
    id: 'killChainTabBtn-' + id,
    className: 'killchain-tab-btn' + (id === 'attack' ? ' active' : ''),
    staticStyle,
    text: label,
    onClick: () => switchKillChainTab(id),
  });
}

function _arDetailList(id, items, visible) {
  const list = _arDetailNode('ul', { staticStyle: 'a086' });
  (items || []).forEach(item => {
    list.appendChild(_arDetailNode('li', { staticStyle: 'a087', text: item }));
  });
  return _arDetailNode('div', {
    id: 'killChainTabContent-' + id,
    className: 'killchain-tab-content',
    staticStyle: visible ? 'a085' : 'a088',
  }, [list]);
}

function _renderKillChainStageDetails(stage, relatedBooks, stageId) {
  const content = document.getElementById('arStageDetailContent');
  if (!content) return;

  const defense = stage.defenseMethod;
  const defenseColor = defense ? defense.color : '#666';

  const metaphor = _arDetailNode('div', { staticStyle: 'a077' }, [
    _arDetailNode('div', { staticStyle: 'a078', text: 'МЕТАФОРА' }),
    _arDetailNode('div', { staticStyle: 'a079', text: stage.metaphor || '—' }),
  ]);

  const defenseBadge = _arDetailNode('div', {
    dynamicStyle: dynamicStyleToken`display:flex;align-items:center;gap:10px;background:${defenseColor}20;border:1px solid ${defenseColor}66;border-radius:10px;padding:10px 12px;margin-bottom:14px;`,
  }, [
    _arDetailNode('div', {
      dynamicStyle: dynamicStyleToken`width:36px;height:36px;border-radius:50%;background:${defenseColor};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex-shrink:0;`,
      text: defense ? defense.code.charAt(0) : '?',
    }),
    _arDetailNode('div', { staticStyle: 'a004' }, [
      _arDetailNode('div', { staticStyle: 'a080', text: 'МЕТОД ЗАЩИТЫ (6D)' }),
      _arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`font-size:13px;font-weight:700;color:${defense ? defense.color : '#fff'};`,
        text: defense ? defense.code + ' — ' + defense.nameRu : '—',
      }),
    ]),
  ]);

  const tabs = _arDetailNode('div', { staticStyle: 'a082' }, [
    _arDetailTab('attack', '⚔ АТАКА', 'a083'),
    _arDetailTab('defense', '🛡 ЗАЩИТА', 'a084'),
    _arDetailTab('tools', 'ИНСТРУМЕНТЫ', 'a084'),
  ]);

  let toolsContent;
  if (stage.defenseTools && stage.defenseTools.length) {
    const tools = _arDetailNode('div', { staticStyle: 'a089' });
    stage.defenseTools.forEach(tool => {
      tools.appendChild(_arDetailNode('div', {
        dynamicStyle: dynamicStyleToken`background:${defenseColor}25;border:1px solid ${defenseColor}55;color:${defense ? defense.color : '#fff'};padding:5px 10px;border-radius:14px;font-size:11px;font-weight:600;`,
        text: tool,
      }));
    });
    toolsContent = tools;
  } else {
    toolsContent = _arDetailNode('div', { staticStyle: 'a090', text: 'Список инструментов не задан' });
  }
  const toolsPanel = _arDetailNode('div', {
    id: 'killChainTabContent-tools',
    className: 'killchain-tab-content',
    staticStyle: 'a088',
  }, [toolsContent]);

  let booksSection;
  if (relatedBooks.length) {
    const books = _arDetailNode('div', { staticStyle: 'a093' });
    relatedBooks.slice(0, 3).forEach(book => {
      books.appendChild(_arDetailNode('button', {
        staticStyle: 'a094',
        onClick: () => openBookFromAR(book.id),
      }, [
        _arDetailNode('div', { staticStyle: 'a095', text: book.title }),
        _arDetailNode('div', { staticStyle: 'a096', text: book.author }),
      ]));
    });
    booksSection = _arDetailNode('div', { staticStyle: 'a091' }, [
      _arDetailNode('div', { staticStyle: 'a092', text: '📚 КНИГИ ПО ТЕМЕ' }),
      books,
    ]);
  } else {
    booksSection = _arDetailNode('div', {
      staticStyle: 'a097',
      text: 'Книг по теме «' + stage.relatedCategory + '» пока нет',
    });
  }

  const lastStage = activeScheme().stages.length;
  const previousDisabled = stageId === 1;
  const nextDisabled = stageId === lastStage;
  const navigation = _arDetailNode('div', { staticStyle: 'a098' }, [
    _arDetailNode('button', {
      disabled: previousDisabled,
      dynamicStyle: dynamicStyleToken`flex:1;padding:12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:#fff;cursor:pointer;font-family:inherit;font-size:12px;font-weight:500;${previousDisabled ? 'opacity:0.4;cursor:default;' : ''}`,
      text: '← Назад',
      onClick: prevKillChainStage,
    }),
    _arDetailNode('button', {
      disabled: nextDisabled,
      dynamicStyle: dynamicStyleToken`flex:1;padding:12px;background:var(--accent-gradient);border:none;border-radius:10px;color:#000;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;${nextDisabled ? 'opacity:0.4;cursor:default;' : ''}`,
      text: 'Вперёд →',
      onClick: nextKillChainStage,
    }),
  ]);

  content.replaceChildren(
    metaphor,
    defenseBadge,
    _arDetailNode('div', { staticStyle: 'a081', text: stage.description }),
    tabs,
    _arDetailList('attack', stage.attacker, true),
    _arDetailList('defense', stage.defender, false),
    toolsPanel,
    booksSection,
    navigation,
  );
}

function selectKillChainStage(stageId) {
  const stage = activeScheme().stages.find(s => s.id === stageId);
  if (!stage) return;

  arSelectedStage = stageId;

  // Подсветить выбранную ноду
  activeScheme().stages.forEach(s => {
    const node = document.getElementById('arNode' + s.id);
    if (!node) return;
    if (s.id === stageId) {
      node.style.background = 'var(--accent-gradient)';
      node.style.borderColor = '#fff';
      node.style.transform = 'scale(1.15)';
      node.style.boxShadow = '0 0 24px rgba(0,212,255,0.7)';
      node.style.animation = 'arNodePulse 1.5s ease-in-out 2';
    } else {
      node.style.background = 'rgba(0,0,0,0.5)';
      node.style.borderColor = isKillChainStageStudied(s) ? '#10b981' : 'rgba(255,255,255,0.2)';
      node.style.transform = 'scale(1)';
      node.style.boxShadow = 'none';
    }
  });

  // Скрыть подсказку
  const stageHint = document.getElementById('arStageHint');
  if (stageHint) stageHint.style.display = 'none';

  // Найти связанные книги
  const relatedBooks = (state.books || []).filter(b => (b.categories || []).includes(stage.relatedCategory));

  // Обновляем заголовок панели
  const titleEl = document.getElementById('arStageDetailTitle');
  if (titleEl) {
    titleEl.textContent = `ЭТАП ${stage.id} — ${stage.nameRu.toUpperCase()}`;
  }

  // Обновляем содержимое панели безопасными DOM-операциями
  _renderKillChainStageDetails(stage, relatedBooks, stageId);

  // Показываем панель и СРАЗУ открываем полностью (без свайпа)
  const panel = document.getElementById('arStageDetails');
  if (panel) {
    panel.style.display = 'block';
    const isWide = window.innerWidth >= 900;
    void panel.offsetHeight; // reflow для transition
    if (isWide) {
      // Правый сайдбар
      panel.style.top = '0';
      panel.style.bottom = '0';
      panel.style.left = 'auto';
      panel.style.right = '0';
      panel.style.width = 'min(420px, 42vw)';
      panel.style.maxHeight = '100%';
      panel.style.height = '100%';
      panel.style.borderRadius = '0';
      panel.style.borderTop = 'none';
      panel.style.borderLeft = '1px solid rgba(255,255,255,0.2)';
      panel.style.transform = 'translateX(0)';
      panel.classList.add('open');
    } else {
      // Узкий экран: нижняя шторка, СРАЗУ открыта полностью
      panel.classList.remove('open');
      panel.style.top = 'auto';
      panel.style.bottom = '0';
      panel.style.left = '0';
      panel.style.right = '0';
      panel.style.width = '100%';
      panel.style.height = 'auto';
      panel.style.maxHeight = '78%';
      panel.style.borderRadius = '20px 20px 0 0';
      panel.style.borderTop = '1px solid rgba(255,255,255,0.2)';
      panel.style.borderLeft = 'none';
      panel.style.transform = 'translateY(0)';
    }
    detailsPanelOpen = true;

    // Кнопка закрытия (добавляем один раз)
    if (!document.getElementById('arПанельCloseBtn')) {
      const cb = document.createElement('button');
      cb.id = 'arПанельCloseBtn';
      cb.textContent = '✕';
      cb.onclick = (e) => { e.stopPropagation(); closeKillChainStage(); };
      cb.style.cssText = 'position:absolute;top:10px;right:12px;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.25);color:#fff;font-size:16px;cursor:pointer;z-index:30;display:flex;align-items:center;justify-content:center;';
      panel.appendChild(cb);
    }
  }
}
function switchKillChainTab(tab) {
  ['attack', 'defense', 'tools'].forEach(t => {
    const btn = document.getElementById('killChainTabBtn-' + t);
    const content = document.getElementById('killChainTabContent-' + t);
    if (!btn || !content) return;
    const isActive = t === tab;
    content.style.display = isActive ? 'block' : 'none';
    if (isActive) {
      // Цвет активной вкладки зависит от типа
      if (t === 'attack') btn.style.background = 'rgba(239,68,68,0.25)';
      else if (t === 'defense') btn.style.background = 'rgba(16,185,129,0.25)';
      else btn.style.background = 'rgba(168,85,247,0.25)';
      btn.style.color = '#fff';
    } else {
      btn.style.background = 'transparent';
      btn.style.color = 'rgba(255,255,255,0.6)';
    }
  });
}
function setKillChainViewMode(mode) {
  if (mode !== 'attack' && mode !== 'defense') mode = 'attack';
  arViewMode = mode;
  localStorage.setItem('aegis_killchain_mode', mode);

  // Перекрашиваем кнопки тумблера
  const btnAtt = document.getElementById('arViewBtnAttack');
  const btnDef = document.getElementById('arViewBtnDefense');
  if (btnAtt && btnDef) {
    if (mode === 'attack') {
      btnAtt.style.background = 'rgba(239,68,68,0.4)';
      btnAtt.style.color = '#fff';
      btnDef.style.background = 'transparent';
      btnDef.style.color = 'rgba(255,255,255,0.6)';
    } else {
      btnDef.style.background = 'rgba(16,185,129,0.4)';
      btnDef.style.color = '#fff';
      btnAtt.style.background = 'transparent';
      btnAtt.style.color = 'rgba(255,255,255,0.6)';
    }
  }

  // Перерисовываем узлы с новым стилем
  applyKillChainViewMode();

  // Если открыта детальная карточка этапа — переключаем активную вкладку
  if (arSelectedStage !== null) {
    switchKillChainTab(mode === 'defense' ? 'defense' : 'attack');
  }
}

function applyKillChainViewMode() {
  activeScheme().stages.forEach(s => {
    const node = document.getElementById('arNode' + s.id);
    if (!node) return;

    const isSelected = s.id === arSelectedStage;
    const isStudied = isKillChainStageStudied(s);

    // Содержимое узла: номер (атака) или буква метода (защита)
    let label;
    if (arViewMode === 'defense' && s.defenseMethod) {
      label = s.defenseMethod.code.charAt(0);
    } else {
      label = String(s.id);
    }
    // Обновляем только текстовый блок (первый <div> внутри button), не ломая остальное
    const labelDiv = node.querySelector('.killchain-node-label');
    if (labelDiv) labelDiv.textContent = label;
    else {
      // Если внутри сложная структура — найдём первый <div> с цифрой
      const first = node.querySelector('div');
      if (first) first.textContent = label;
    }

    // Цвет рамки
    if (isSelected) {
      // selectKillChainStage сам красит выбранный — не трогаем
      return;
    }
    let borderColor;
    if (arViewMode === 'defense') {
      borderColor = s.defenseMethod ? s.defenseMethod.color : 'rgba(255,255,255,0.2)';
    } else {
      borderColor = isStudied ? '#10b981' : 'rgba(255,255,255,0.2)';
    }
    node.style.borderColor = borderColor;
  });
}
  
function closeKillChainStage() {
  arSelectedStage = null;
  // Сбросить визуальное состояние нод
  activeScheme().stages.forEach(s => {
    const node = document.getElementById('arNode' + s.id);
    if (!node) return;
    node.style.background = 'rgba(0,0,0,0.7)';
    node.style.borderColor = isKillChainStageStudied(s) ? '#10b981' : 'rgba(0,212,255,0.5)';
    node.style.transform = 'scale(1)';
    node.style.boxShadow = 'none';
  });
  const detailPanel = document.getElementById('arStageDetails');
  if (detailPanel) {
    detailPanel.classList.remove('open');
    detailPanel.style.display = 'none';
    // полный сброс инлайнов сайдбара
    ['top','bottom','left','right','width','maxHeight','height','borderRadius','borderTop','borderLeft','transform'].forEach(p => detailPanel.style[p] = '');
  }
  const root = document.getElementById('arSchemeRoot');
  if (root) root.classList.remove('panel-visible');
}

function prevKillChainStage() {
  if (arSelectedStage && arSelectedStage > 1) {
    selectKillChainStage(arSelectedStage - 1);
  }
}

function nextKillChainStage() {
  if (arSelectedStage && arSelectedStage < activeScheme().stages.length) {
    selectKillChainStage(arSelectedStage + 1);
  }
}

function openBookFromAR(bookId) {
  // Закрываем AR-экран и переходим на детальную страницу книги
  closeAR();
  openBookDetail(bookId);
}
