// Настройка ESLint для фронтенда.
//
// До сих пор у фронта была только проверка синтаксиса через node --check, то
// есть ловилось лишь то, что вообще не разбирается. Всё остальное искали
// глазами — и находили: дважды объявленную функцию, три дублирующихся ключа
// в объекте иконок, остатки после автоматических правок. Каждый раз это был
// код, который не выполняется, но выглядит рабочим.
//
// no-undef выключен намеренно. Файлы фронта — обычные скрипты, а не модули:
// app.js пользуется функциями из api.js, обработчики вызываются из разметки.
// Для линтера это неразрешённые имена, и правило дало бы сотни ложных
// срабатываний, за которыми потерялись бы настоящие.
//
// no-unused-vars ограничено локальными областями по той же причине: функции
// верхнего уровня вызываются из data-onclick, а не из кода, и линтер об этом
// знать не может.

export default [
  {
    ignores: [
      "frontend/vendor/**",
      "frontend/inline-boot.js",
      "**/node_modules/**",
    ],
  },
  {
    files: ["frontend/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
    },
    rules: {
      // --- ошибки: почти всегда настоящая поломка -------------------------
      // Второе объявление молча перекрывает первое, и правка первого не даёт
      // эффекта. Ровно так были потеряны три иконки и одна функция.
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-dupe-else-if": "error",
      "no-duplicate-case": "error",
      "no-func-assign": "error",
      "no-const-assign": "error",
      "no-unreachable": "error",
      "no-self-assign": "error",
      // Присваивание в условии — обычно опечатка вместо сравнения
      "no-cond-assign": "error",
      "valid-typeof": "error",
      "use-isnan": "error",
      "no-compare-neg-zero": "error",

      // --- предупреждения: стоит посмотреть, но не блокирует --------------
      "no-unused-vars": [
        "warn",
        { vars: "local", args: "after-used", caughtErrors: "none" },
      ],
      "no-empty": "warn",
      "no-redeclare": "warn",
      "no-sparse-arrays": "warn",
      "no-fallthrough": "warn",

      "no-undef": "off",
    },
  },
  {
    // Диспетчер и помощники читают глобальные объекты браузера напрямую
    files: ["frontend/inline-handlers.js", "frontend/csp-helpers.js"],
    rules: {
      "no-unused-vars": "off",
    },
  },
];
