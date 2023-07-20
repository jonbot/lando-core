'use strict';

// Modules
const _ = require('lodash');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

// @TODO: not the best to reach back this far
const moveConfig = require('../../../lib/utils').moveConfig;
const utils = require('../lib/utils');

/*
 * The lowest level lando service, this is where a lot of the deep magic lives
 */
module.exports = {
  api: 4,
  name: '_lando',
  parent: '_compose',
  builder: parent => class LandoLandoV4 extends parent {
    constructor(
      id,
      {
        name,
        type,
        userConfRoot,
        version,
        app = '',
        confDest = '',
        confSrc = '',
        config = {},
        data = `data_${name}`,
        dataHome = `home_${name}`,
        entrypoint = '/lando-entrypoint.sh',
        home = '',
        moreHttpPorts = [],
        info = {},
        legacy = [],
        meUser = 'www-data',
        patchesSupported = false,
        pinPairs = {},
        ports = [],
        project = '',
        overrides = {},
        refreshCerts = false,
        remoteFiles = {},
        scripts = [],
        sport = '443',
        ssl = false,
        sslExpose = true,
        root = '',
        webroot = '/app',
      } = {},
      imageFile,
      ...compose
    ) {
      // @NOTE:
      // 1. restructure file so it rougly works like
      // compute shared stuff eg tag name
      // generate dockerfiles?
      // generate compose files

      // @TODO POC:
      // 1. purge shit?
      // 2. generate a dockerfile?
      // 3. set the built image into the compose data?

      // @TODO SCRIPTS:
      // 1. how do we add scripts to the build context?
      // * add a script to the builderfile, have a app.addScript func that also adds script to the builderfile
      // * lando-v4 needs some handler for the scripts metadata -> copy to build context -> COPY scripts /etc/lando

      // @TODO POC BUILDSTEPS?:
      // 1. how do we add ENV/LABELS/USER/RUN instructions (build groups)
      // 2. how do we set the entrypoint/command?

      // console.log(JSON.stringify(data.data, null, 2));
      // @todo: figure out how to generate the tmpDir string from info available.
      if (_.includes(legacy, version)) {
        console.error(chalk.yellow(`${type} version ${version} is a legacy version! We recommend upgrading.`));
      }

      // Move our config into the userconfroot if we have some
      // NOTE: we need to do this because on macOS and Windows not all host files
      // are shared into the docker vm
      if (fs.existsSync(confSrc)) moveConfig(confSrc, confDest);

      // Get some basic locations
      const scriptsDir = path.join(userConfRoot, 'scripts');
      const entrypointScript = path.join(scriptsDir, 'lando-entrypoint.sh');
      const addCertsScript = path.join(scriptsDir, 'add-cert.sh');
      const refreshCertsScript = path.join(scriptsDir, 'refresh-certs.sh');

      // Handle volumes
      const volumes = [
        `${userConfRoot}:/lando:cached`,
        `${scriptsDir}:/helpers`,
        `${entrypointScript}:/lando-entrypoint.sh`,
        `${dataHome}:/var/www`,
      ];

      // Handle ssl
      if (ssl) {
        volumes.push(`${addCertsScript}:/scripts/000-add-cert`);
        if (sslExpose) ports.push(sport);
      }

      // Add in some more dirz if it makes sense
      if (home) volumes.push(`${home}:/user:cached`);

      // Handle cert refresh
      // @TODO: this might only be relevant to the proxy, if so let's move it there
      if (refreshCerts) volumes.push(`${refreshCertsScript}:/scripts/999-refresh-certs`);

      // Add in any custom pre-runscripts
      _.forEach(scripts, script => {
        const local = path.resolve(root, script);
        const remote = path.join('/scripts', path.basename(script));
        volumes.push(`${local}:${remote}`);
      });

      // Handle custom config files
      _.forEach(config, (file, type) => {
        if (_.has(remoteFiles, type)) {
          const local = path.resolve(root, config[type]);
          const remote = remoteFiles[type];
          volumes.push(`${local}:${remote}`);
        }
      });

      // Handle Environment
      const environment = {LANDO_SERVICE_NAME: name, LANDO_SERVICE_TYPE: type};
      // Handle http/https ports
      const labels = {
        'io.lando.http-ports': _.uniq(['80', '443'].concat(moreHttpPorts)).join(','),
        'io.lando.https-ports': _.uniq(['443'].concat([sport])).join(','),
      };
      // Set a reasonable log size
      const logging = {driver: 'json-file', options: {'max-file': '3', 'max-size': '10m'}};

      // Add named volumes and other thingz into our primary service
      const namedVols = {};
      _.set(namedVols, data, {});
      _.set(namedVols, dataHome, {});
      compose.push({
        services: _.set({}, name, {
          entrypoint,
          environment,
          labels,
          logging,
          ports,
          volumes,
        }),
        volumes: namedVols,
      });

      // Add a final source if we need to pin pair
      if (_.includes(_.keys(pinPairs), version)) {
        compose.push({services: _.set({}, name, {image: _.get(pinPairs, version, version)})});
      }

      // Add our overrides at the end
      compose.push({services: _.set({}, name, utils.normalizeOverrides(overrides, root))});

      // Add some info basics
      info.config = config;
      info.service = name;
      info.type = type;
      info.version = version;
      info.meUser = meUser;
      info.hasCerts = ssl;

      // @TODO: what should this be?
      // should this just be whatever dockerfile-generator needs? we guess?
      // lets hardcode for now and then we need to consider how this is computed?
      // DO NOT FORGET ABOUT generator.convertToJSON(inputDockerFile)

      // @TODO: use generateFromArray directly because doesnt even seem to need the promise?
      const buildContext = `[
        {
          "from": "nginx:latest"
        },
        {
          "run": [ "adduser", "--disabled-password", "-gecos", "", "testuser" ]
        },
         {
          "run": [ "adduser", "--disabled-password", "-gecos", "", "testuser2" ]
        },
         {
          "user": "testuser"
        },
         {
          "working_dir": "/home/testuser/app"
        },
        {
          "volumes": [ "/home/testuser/app" ]
        },
         {
          "labels": {
            "name": "value"
          }
        },
         {
          "env": {
            "MIKE": "value1",
            "ALEC": "value2"
          }
        }
      ]`;

      // Pass it down
      super(id, info, buildContext, ...compose);
    };
  },
};
