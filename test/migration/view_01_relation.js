/* eslint-disable newline-per-chained-call, global-require, no-undef */

exports.auto = (migrator, knex) => [
  migrator('STUDENT_INFORMATION', (view) => {
    view.columns(['student_id', 'name', 'home_phone_number', 'mobile_phone_number', 'email']);
    view.as(
      knex('STUDENTS AS S')
        .select('S.STUDENT_ID', 'NAME', 'HOME_PHONE.PHONE', 'MOBILE_PHONE.PHONE', 'SD.EMAIL')
        .leftJoin(
          'PHONES AS HOME_PHONE',
          'S.HOME_PHONE_ID',
          '=',
          'HOME_PHONE.PHONE_ID',
        )
        .leftJoin(
          'PHONES AS MOBILE_PHONE',
          'S.MOBILE_PHONE_ID',
          '=',
          'MOBILE_PHONE.PHONE_ID',
        )
        .leftJoin(
          'STUDENTS_DETAIL AS SD',
          'S.STUDENT_ID',
          '=',
          'SD.STUDENT_ID',
        )
      ,
    );
  }),
];
