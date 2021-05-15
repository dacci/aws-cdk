import { expect } from '@aws-cdk/assert-internal';
import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as cdk from '@aws-cdk/core';
import { nodeunitShim, Test } from 'nodeunit-shim';
import { HostedZone, PublicHostedZone } from '../lib';

nodeunitShim({
  'Hosted Zone': {
    'Hosted Zone constructs the ARN'(test: Test) {
      // GIVEN
      const stack = new cdk.Stack(undefined, 'TestStack', {
        env: { account: '123456789012', region: 'us-east-1' },
      });

      const testZone = new HostedZone(stack, 'HostedZone', {
        zoneName: 'testZone',
      });

      test.deepEqual(stack.resolve(testZone.hostedZoneArn), {
        'Fn::Join': [
          '',
          [
            'arn:',
            { Ref: 'AWS::Partition' },
            ':route53:::hostedzone/',
            { Ref: 'HostedZoneDB99F866' },
          ],
        ],
      });

      test.done();
    },
  },

  'Supports tags'(test: Test) {
    // GIVEN
    const stack = new cdk.Stack();

    // WHEN
    const hostedZone = new HostedZone(stack, 'HostedZone', {
      zoneName: 'test.zone',
    });
    cdk.Tags.of(hostedZone).add('zoneTag', 'inMyZone');

    // THEN
    expect(stack).toMatch({
      Resources: {
        HostedZoneDB99F866: {
          Type: 'AWS::Route53::HostedZone',
          Properties: {
            Name: 'test.zone.',
            HostedZoneTags: [
              {
                Key: 'zoneTag',
                Value: 'inMyZone',
              },
            ],
          },
        },
      },
    });

    test.done();
  },

  'with crossAccountZoneDelegationPrincipal'(test: Test) {
    // GIVEN
    const stack = new cdk.Stack(undefined, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });

    // WHEN
    new PublicHostedZone(stack, 'HostedZone', {
      zoneName: 'testZone',
      crossAccountZoneDelegationPrincipal: new iam.AccountPrincipal('223456789012'),
      crossAccountZoneDelegationRoleName: 'myrole',
    });

    // THEN
    expect(stack).toMatch({
      Resources: {
        HostedZoneDB99F866: {
          Type: 'AWS::Route53::HostedZone',
          Properties: {
            Name: 'testZone.',
          },
        },
        HostedZoneCrossAccountZoneDelegationRole685DF755: {
          Type: 'AWS::IAM::Role',
          Properties: {
            RoleName: 'myrole',
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Principal: {
                    AWS: {
                      'Fn::Join': [
                        '',
                        [
                          'arn:',
                          {
                            Ref: 'AWS::Partition',
                          },
                          ':iam::223456789012:root',
                        ],
                      ],
                    },
                  },
                },
              ],
              Version: '2012-10-17',
            },
            Policies: [
              {
                PolicyDocument: {
                  Statement: [
                    {
                      Action: 'route53:ChangeResourceRecordSets',
                      Effect: 'Allow',
                      Resource: {
                        'Fn::Join': [
                          '',
                          [
                            'arn:',
                            {
                              Ref: 'AWS::Partition',
                            },
                            ':route53:::hostedzone/',
                            {
                              Ref: 'HostedZoneDB99F866',
                            },
                          ],
                        ],
                      },
                    },
                    {
                      Action: 'route53:ListHostedZonesByName',
                      Effect: 'Allow',
                      Resource: '*',
                    },
                  ],
                  Version: '2012-10-17',
                },
                PolicyName: 'delegation',
              },
            ],
          },
        },
      },
    });

    test.done();
  },

  'with crossAccountZoneDelegationPrincipal, throws if name provided without principal'(test: Test) {
    // GIVEN
    const stack = new cdk.Stack(undefined, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });

    // THEN
    test.throws(() => {
      new PublicHostedZone(stack, 'HostedZone', {
        zoneName: 'testZone',
        crossAccountZoneDelegationRoleName: 'myrole',
      });
    }, /crossAccountZoneDelegationRoleName property is not supported without crossAccountZoneDelegationPrincipal/);

    test.done();
  },

  'with keySigningKey and DNSSEC'(test: Test) {
    // GIVEN
    const stack = new cdk.Stack(undefined, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    const primaryKey = kms.Key.fromKeyArn(stack, 'PrimaryKey', stack.formatArn({
      service: 'kms', resource: 'key', resourceName: '00000000-0000-0000-0000-000000000000',
    }));
    const secondaryKey = kms.Key.fromKeyArn(stack, 'SecondaryKey', stack.formatArn({
      service: 'kms', resource: 'key', resourceName: '00000001-0000-0000-0000-000000000000',
    }));

    // WHEN
    new PublicHostedZone(stack, 'HostedZone', {
      zoneName: 'testZone',
      keySigningKeys: {
        key: {
          masterKey: primaryKey,
        },
        Key_1: {
          masterKey: secondaryKey,
        },
      },
    });

    // THEN
    expect(stack).toMatch({
      Resources: {
        HostedZoneDB99F866: {
          Type: 'AWS::Route53::HostedZone',
          Properties: {
            Name: 'testZone.',
          },
        },
        HostedZonekeyKeySigningKeyD6C2F8F8: {
          Type: 'AWS::Route53::KeySigningKey',
          Properties: {
            HostedZoneId: {
              Ref: 'HostedZoneDB99F866',
            },
            KeyManagementServiceArn: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000',
                ],
              ],
            },
            Name: 'key',
            Status: 'ACTIVE',
          },
        },
        HostedZoneKey1KeySigningKeyF8823D12: {
          Type: 'AWS::Route53::KeySigningKey',
          Properties: {
            HostedZoneId: {
              Ref: 'HostedZoneDB99F866',
            },
            KeyManagementServiceArn: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':kms:us-east-1:123456789012:key/00000001-0000-0000-0000-000000000000',
                ],
              ],
            },
            Name: 'Key_1',
            Status: 'ACTIVE',
          },
        },
        HostedZoneDNSSEC79297416: {
          Type: 'AWS::Route53::DNSSEC',
          Properties: {
            HostedZoneId: {
              Ref: 'HostedZoneDB99F866',
            },
          },
          DependsOn: [
            'HostedZoneKey1KeySigningKeyF8823D12',
            'HostedZonekeyKeySigningKeyD6C2F8F8',
          ],
        },
      },
    });

    test.done();
  },

  'with inactive keySigningKey'(test: Test) {
    // GIVEN
    const stack = new cdk.Stack(undefined, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    const key = kms.Key.fromKeyArn(stack, 'Key', stack.formatArn({
      service: 'kms', resource: 'key', resourceName: '00000000-0000-0000-0000-000000000000',
    }));

    // WHEN
    new PublicHostedZone(stack, 'HostedZone', {
      zoneName: 'testZone',
      keySigningKeys: {
        default: {
          masterKey: key,
          active: false,
        },
      },
    });

    // THEN
    expect(stack).toMatch({
      Resources: {
        HostedZoneDB99F866: {
          Type: 'AWS::Route53::HostedZone',
          Properties: {
            Name: 'testZone.',
          },
        },
        HostedZonedefaultKeySigningKeyC9D6CA39: {
          Type: 'AWS::Route53::KeySigningKey',
          Properties: {
            HostedZoneId: {
              Ref: 'HostedZoneDB99F866',
            },
            KeyManagementServiceArn: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':kms:us-east-1:123456789012:key/00000000-0000-0000-0000-000000000000',
                ],
              ],
            },
            Name: 'default',
            Status: 'INACTIVE',
          },
        },
      },
    });

    test.done();
  },

  'with keySigningKey, throws when more than 2 keys are specified'(test: Test) {
    // GIVEN
    const stack = new cdk.Stack(undefined, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    const primaryKey = kms.Key.fromKeyArn(stack, 'PrimaryKey', stack.formatArn({
      service: 'kms', resource: 'key', resourceName: '00000000-0000-0000-0000-000000000000',
    }));
    const secondaryKey = kms.Key.fromKeyArn(stack, 'SecondaryKey', stack.formatArn({
      service: 'kms', resource: 'key', resourceName: '00000001-0000-0000-0000-000000000000',
    }));
    const tertiaryKey = kms.Key.fromKeyArn(stack, 'TertiaryKey', stack.formatArn({
      service: 'kms', resource: 'key', resourceName: '00000002-0000-0000-0000-000000000000',
    }));

    // THEN
    test.throws(() => {
      new PublicHostedZone(stack, 'HostedZone', {
        zoneName: 'testZone',
        keySigningKeys: {
          primary: {
            masterKey: primaryKey,
          },
          secondary: {
            masterKey: secondaryKey,
          },
          tertiary: {
            masterKey: tertiaryKey,
          },
        },
      });
    }, 'At most 2 key signing keys can be created.');

    test.done();
  },

  'with keySigningKey, throw if key name is too short'(test: Test) {
    // GIVEN
    const stack = new cdk.Stack(undefined, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    const key = kms.Key.fromKeyArn(stack, 'Key', stack.formatArn({
      service: 'kms', resource: 'key', resourceName: '00000000-0000-0000-0000-000000000000',
    }));

    // THEN
    test.throws(() => {
      new PublicHostedZone(stack, 'HostedZone', {
        zoneName: 'testZone',
        keySigningKeys: {
          kk: {
            masterKey: key,
          },
        },
      });
    }, 'Key signing key name must be at least 3 characters.');

    test.done();
  },

  'with keySigningKey, throw if key name is too long'(test: Test) {
    // GIVEN
    const stack = new cdk.Stack(undefined, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    const key = kms.Key.fromKeyArn(stack, 'Key', stack.formatArn({
      service: 'kms', resource: 'key', resourceName: '00000000-0000-0000-0000-000000000000',
    }));

    // THEN
    test.throws(() => {
      new PublicHostedZone(stack, 'HostedZone', {
        zoneName: 'testZone',
        keySigningKeys: {
          ['K'.repeat(129)]: {
            masterKey: key,
          },
        },
      });
    }, 'Key signing key name must not be longer than 128 characters.');

    test.done();
  },

  'with keySigningKey, throw if key name contains illegal character'(test: Test) {
    // GIVEN
    const stack = new cdk.Stack(undefined, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    const key = kms.Key.fromKeyArn(stack, 'Key', stack.formatArn({
      service: 'kms', resource: 'key', resourceName: '00000000-0000-0000-0000-000000000000',
    }));

    // THEN
    test.throws(() => {
      new PublicHostedZone(stack, 'HostedZone', {
        zoneName: 'testZone',
        keySigningKeys: {
          'key signing key': {
            masterKey: key,
          },
        },
      });
    }, 'Key signing key name can contain only numbers, letters and underscores (_).');

    test.done();
  },
});
