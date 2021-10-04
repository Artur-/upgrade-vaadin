#!/usr/bin/env node

const { convert } = require('xmlbuilder2');

const fs = require('fs');

const replacePlugin = (plugin) => {
  if (plugin.artifactId === 'vaadin-maven-plugin') {
    plugin.artifactId = 'flow-maven-plugin';
    plugin.version = '${flow.version}';
  }
  return plugin;
};
const replacePlugins = (plugins) => {
  if (Array.isArray(plugins)) {
    profile.build.plugins.plugin = profile.build.plugins.plugin.map((plugin) => replacePlugin(plugin));
  } else if (plugins['#']) {
    plugins['#'] = plugins['#'].map((maybePlugin) => {
      if (maybePlugin.plugin) {
        maybePlugin.plugin = replacePlugin(maybePlugin.plugin);
      }
      return maybePlugin;
    });
  } else {
    plugins.plugin = replacePlugin(plugins.plugin);
  }
  return plugins;
};
const replaceProfile = (profile) => {
  profile.build.plugins = replacePlugins(profile.build.plugins);
  return profile;
};

try {
  var myArgs = process.argv.slice(2);
  let flowVersion;
  let vaadinVersion;
  if (myArgs.length === 0) {
    console.error('Usage: change-vaadin <vaadin version> [flow version]');
    return;
  }
  if (myArgs[0]) {
    vaadinVersion = myArgs[0];
  }
  if (myArgs[1]) {
    flowVersion = myArgs[1];
  }

  const data = fs.readFileSync('pom.xml', 'utf8');
  const json = convert(data, { format: 'object' });

  const project = json.project;
  if (vaadinVersion) {
    project.properties['vaadin.version'] = vaadinVersion;
  }
  if (vaadinVersion) {
    project.properties['flow.version'] = flowVersion;
  }
  if (flowVersion) {
    let depManDep = project.dependencyManagement.dependencies.dependency;
    let depManDepFound = false;
    if (Array.isArray(depManDep)) {
      depManDep.forEach((d) => {
        if (d.artifactId === 'flow-bom') {
          d.version = '${flow.version}';
          depManDepFound = true;
        }
      });
    } else if (depManDep.artifactId === 'flow-bom') {
      depManDep.version = '${flow.version}';
      depManDepFound = true;
    }
    if (!depManDepFound) {
      newDepManDep = {
        groupId: 'com.vaadin',
        artifactId: 'flow-bom',
        version: '${flow.version}',
        type: 'pom',
        scope: 'import',
      };
      if (Array.isArray(depManDep)) {
        depManDep = [newDepManDep, ...depManDep];
      } else {
        depManDep = [newDepManDep, depManDep];
      }
    }
    project.dependencyManagement.dependencies.dependency = depManDep;

    project.build.plugins = replacePlugins(project.build.plugins);

    if (Array.isArray(project.profiles.profile)) {
      project.profiles.profile = project.profiles.profile.map((profile) => replaceProfile(profile));
    } else {
      project.profiles.profile = replaceProfile(project.profiles.profile);
    }
  }

  const xml = convert(json, { format: 'xml', prettyPrint: true, indent: '    ' });
  fs.writeFileSync('pom.xml', xml);
} catch (err) {
  console.error(err);
}
