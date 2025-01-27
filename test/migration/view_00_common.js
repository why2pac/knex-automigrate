/* eslint-disable newline-per-chained-call, global-require, no-undef */

exports.auto = (migrator, knex) => [
  migrator('KEYVALS_ID2', (view) => {
    view.columns(['val', 'created_at', 'expiry_at']);
    view.as(knex('KEYVALS_ID').select('VAL', 'CREATED_AT', 'EXPIRY_AT'));
  }),
  migrator('student_information', (view) => {
    view.as(
      knex('STUDENTS')
        .select('STUDENT_ID', 'NAME', 'HOME_PHONE.PHONE as HOME_PHONE_NUMBER', 'MOBILE_PHONE.PHONE as MOBILE_PHONE_NUMBER')
        .join(
          'PHONES as HOME_PHONE',
          'STUDENTS.HOME_PHONE_ID',
          '=',
          'HOME_PHONE.PHONE_ID',
        )
        .join(
          'PHONES as MOBILE_PHONE',
          'STUDENTS.MOBILE_PHONE_ID',
          '=',
          'MOBILE_PHONE.PHONE_ID',
        ),
    );
  }),
];
