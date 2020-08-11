/* eslint-disable newline-per-chained-call, global-require, no-undef */

exports.auto = (migrator) => [
  migrator('PHONES', (table) => {
    table.bigIncrements('PHONE_ID').unsigned().comment('Primary Key for Table.');
    table.string('PHONE', 128).notNullable().comment('Phone');
  }),
  migrator('STUDENTS', (table) => {
    table.bigIncrements('STUDENT_ID').unsigned().comment('Primary Key for Table.');
    table.string('NAME', 128).notNullable().comment('Name');

    table.bigInteger('HOME_PHONE_ID').unsigned().references('PHONES.PHONE_ID').comment('Phone ID');
    table.bigInteger('MOBILE_PHONE_ID').unsigned().references('PHONES.PHONE_ID').comment('Phone ID');
  }),
  migrator('STUDENTS_DETAIL', (table) => {
    table.bigIncrements('STUDENT_ID').unsigned().comment('Primary Key for Table.');
    table.string('ADDRESS', 128).nullable().comment('Phone');
    table.string('EMAIL', 128).nullable().comment('Email');
  }),
  migrator('CLASSES', (table) => {
    table.bigIncrements('CLASS_ID').unsigned().comment('Primary Key for Table.');
    table.text('SUBJECT', 128).notNullable().comment('Subject');
  }),
  migrator('CLASSES_DETAIL', (table) => {
    table.bigIncrements('CLASS_ID').unsigned().comment('Primary Key for Table.');
    table.text('PROFESSOR', 128).notNullable().comment('Professor Name');
  }),
  migrator('STUDENTS_CLASSES', (table) => {
    table.bigInteger('STUDENT_ID').unsigned().comment('Student ID');
    table.bigInteger('CLASS_ID').unsigned().comment('Class ID');
    table.string('NAME', 128).notNullable().comment('Name');

    table.unique(['STUDENT_ID', 'CLASS_ID'], 'UK_STUDENTS_CLASSES');
  }),
  migrator('STUDENTS_CLASSES_DETAIL', (table) => {
    table.bigInteger('MY_STUDENT_ID').unsigned().comment('Student ID');
    table.bigInteger('MY_CLASS_ID').unsigned().comment('Class ID');
    table.string('NOTE', 'longtext').notNullable().comment('Note');

    table.unique(['MY_STUDENT_ID', 'MY_CLASS_ID'], 'UK_STUDENTS_CLASSES');
  }),
];
