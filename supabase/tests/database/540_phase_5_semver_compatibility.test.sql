begin;

select no_plan();

select ok(
  app_private.device_semver_gte('1.2.3', '1.2.3'),
  'equal release versions are compatible'
);
select ok(
  app_private.device_semver_gte(
    '1.2.3+robot.windows.7',
    '1.2.3+minimum.metadata'
  ),
  'build metadata does not affect precedence'
);
select ok(
  app_private.device_semver_gte('2.0.0', '1.999999999999999999999.999999999999999999999'),
  'core identifiers compare numerically without integer overflow'
);
select ok(
  app_private.device_semver_gte('1.0.0', '1.0.0-rc.1')
    and not app_private.device_semver_gte('1.0.0-rc.1', '1.0.0'),
  'a release outranks every prerelease with the same core'
);
select ok(
  not app_private.device_semver_gte('1.0.0-alpha', '1.0.0-alpha.1')
    and not app_private.device_semver_gte(
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta'
    )
    and not app_private.device_semver_gte(
      '1.0.0-alpha.beta',
      '1.0.0-beta'
    )
    and not app_private.device_semver_gte('1.0.0-beta', '1.0.0-beta.2')
    and not app_private.device_semver_gte(
      '1.0.0-beta.2',
      '1.0.0-beta.11'
    )
    and not app_private.device_semver_gte(
      '1.0.0-beta.11',
      '1.0.0-rc.1'
    )
    and not app_private.device_semver_gte('1.0.0-rc.1', '1.0.0'),
  'SemVer prerelease precedence follows the canonical ordering chain'
);
select ok(
  app_private.device_semver_gte('1.0.0-beta', '1.0.0-1')
    and not app_private.device_semver_gte('1.0.0-1', '1.0.0-beta'),
  'numeric prerelease identifiers have lower precedence than non-numeric identifiers'
);
select ok(
  app_private.device_semver_gte('1.0.0-beta.11', '1.0.0-beta.2')
    and not app_private.device_semver_gte(
      '1.0.0-beta.2',
      '1.0.0-beta.11'
    ),
  'numeric prerelease identifiers compare numerically rather than lexically'
);
select ok(
  not app_private.device_semver_gte('01.0.0', '1.0.0')
    and not app_private.device_semver_gte('1.0.0-alpha.01', '1.0.0-alpha.1')
    and not app_private.device_semver_gte('1.0', '1.0.0')
    and not app_private.device_semver_gte('v1.0.0', '1.0.0'),
  'invalid SemVer and leading-zero numeric identifiers fail closed'
);

select * from finish();

rollback;
