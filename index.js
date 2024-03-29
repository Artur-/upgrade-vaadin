#!/usr/bin/env node

const xmldoc = require('xmldoc');
const fs = require('fs');

const debug = false;

const getNodeEnd = (node) => {
  const find = `${node.name}>`;
  return data.indexOf(find, node.position) + find.length;
};
const removeNode = (node) => {
  const start = node.startTagPosition - 1;
  const end = getNodeEnd(node);

  let before = start - 1;
  let after = end;
  while (data.charAt(before) === ' ' || data.charAt(before) === '\t') {
    before--;
  }
  while (data.charAt(after) === ' ' || data.charAt(after) === '\t') {
    after++;
  }

  if (data.charAt(before) === '\n' && data.charAt(after) === '\n') {
    // Remove the whole line
    replacements.push({ position: before, length: after - before, replacement: '' });
  } else {
    replacements.push({ position: start, length: end - start, replacement: '' });
  }
};
const replaceValue = (node, text) => {
  if (node.val === text) {
    return;
  }
  replacements.push({ position: node.position, length: node.val.length, replacement: text });
};
const addAsFirstChild = (node, text) => {
  replacements.push({ position: node.position, length: 0, replacement: text });
};
const addAfter = (node, text) => {
  const endOfNode = getNodeEnd(node);
  replacements.push({
    position: endOfNode,
    length: 0,
    replacement: text,
  });
};

const replacePlugin = (node, flowVersion, isHilla) => {
  const buildPlugins = node.descendantWithPath('build.plugins');
  if (!buildPlugins) {
    return;
  }
  buildPlugins.childrenNamed('plugin').forEach((plugin) => {
    const artifactId = plugin.descendantWithPath('artifactId');
    const groupId = plugin.descendantWithPath('groupId');
    if (flowVersion && (artifactId.val === 'vaadin-maven-plugin' || artifactId.val === 'hilla-maven-plugin')) {
      replaceValue(groupId, 'com.vaadin');
      replaceValue(artifactId, 'flow-maven-plugin');
      replaceValue(plugin.descendantWithPath('version'), '${flow.version}');
    } else if (!flowVersion && artifactId.val === 'flow-maven-plugin') {
      if (isHilla) {
        replaceValue(groupId, 'dev.hilla');
        replaceValue(artifactId, 'hilla-maven-plugin');
        replaceValue(plugin.descendantWithPath('version'), '${hilla.version}');
      } else {
        replaceValue(groupId, 'com.vaadin');
        replaceValue(artifactId, 'vaadin-maven-plugin');
        replaceValue(plugin.descendantWithPath('version'), '${vaadin.version}');
      }
    }
  });
};
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
var document = new xmldoc.XmlDocument(data);
const replacements = [];
const indent = '    ';

// Properties
const properties = document.descendantWithPath('properties');
let vaadinVersionNode = undefined;
let isHilla = undefined;
let flowVersionHandled = false;
let prerelease = false;
if (vaadinVersion !== '-' && !vaadinVersion.match(/^\d+\.\d+\.\d+$/)) {
  prerelease = true;
}
if (flowVersion && !flowVersion.match(/^\d+\.\d+\.\d+$/)) {
  prerelease = true;
}

properties.eachChild((property) => {
  if (property.name === 'vaadin.version' || property.name === 'hilla.version') {
    if (vaadinVersion !== '-') {
      replaceValue(property, vaadinVersion);
    }
    vaadinVersionNode = property;
    isHilla = property.name === 'hilla.version';
  } else if (property.name === 'flow.version') {
    if (!flowVersion) {
      removeNode(property);
    } else {
      replaceValue(property, flowVersion);
    }
    flowVersionHandled = true;
  }
});

if (!vaadinVersionNode) {
  console.error('No vaadin.version property found. Is this a Vaadin project?');
  return;
}

if (flowVersion && !flowVersionHandled) {
  addAfter(vaadinVersionNode, '\n' + indent.repeat(2) + `<flow.version>${flowVersion}</flow.version>`);
}

// Dependency management
const dependencyManagement = document.descendantWithPath('dependencyManagement.dependencies');
let flowBomHandled = false;
let vaadinBomNode = undefined;

dependencyManagement.eachChild((dependency) => {
  if (
    dependency.valueWithPath('artifactId') === 'vaadin-bom' ||
    dependency.valueWithPath('artifactId') === 'hilla-bom'
  ) {
    vaadinBomNode = dependency;
  } else if (dependency.valueWithPath('artifactId') === 'flow-bom') {
    if (!flowVersion) {
      removeNode(dependency);
    }
    flowBomHandled = true;
    return;
  }
});
if (!vaadinBomNode) {
  console.log('No vaadin-bom dependency found. Is this a Vaadin project?');
  return;
}
if (!flowBomHandled && flowVersion) {
  // Must be first
  const dep = `\n${indent.repeat(3)}<dependency>
${indent.repeat(4)}<groupId>com.vaadin</groupId>
${indent.repeat(4)}<artifactId>flow-bom</artifactId>
${indent.repeat(4)}<version>\${flow.version}</version>
${indent.repeat(4)}<type>pom</type>
${indent.repeat(4)}<scope>import</scope>
${indent.repeat(3)}</dependency>`;
  addAsFirstChild(dependencyManagement, dep);
}

// Repositories
if (prerelease) {
  const repositories = document.descendantWithPath('repositories');
  const pluginRepositories = document.descendantWithPath('pluginRepositories');
  const repositoryCode = `${indent.repeat(2)}<repository>
${indent.repeat(3)}<id>vaadin-prereleases</id>
${indent.repeat(3)}<url>https://maven.vaadin.com/vaadin-prereleases/</url>
${indent.repeat(2)}</repository>`;
  const repositoriesCode = `${indent.repeat(1)}<repositories>
${repositoryCode}
${indent.repeat(1)}</repositories>`;
  const pluginRepositoryCode = `${indent.repeat(2)}<pluginRepository>
${indent.repeat(3)}<id>vaadin-prereleases</id>
${indent.repeat(3)}<url>https://maven.vaadin.com/vaadin-prereleases/</url>
${indent.repeat(2)}</pluginRepository>`;
  const pluginRepositoriesCode = `${indent.repeat(1)}<pluginRepositories>
${repositoryCode}
${indent.repeat(1)}</pluginRepositories>`;

  if (!repositories) {
    addAfter(document.descendantWithPath('dependencyManagement'), "\n"+repositoriesCode);
  } else {
    const hasRepo = repositories.childrenNamed('repository').find((repo) => {
      const url = repo.descendantWithPath('url').children[0].text;
      return (
        url.trim() === 'https://maven.vaadin.com/vaadin-prereleases' ||
        url.trim() === 'https://maven.vaadin.com/vaadin-prereleases/'
      );
    });
    if (!hasRepo) {
      addAsFirstChild(repositories, "\n"+repositoryCode);
    }
  }
  if (!pluginRepositories) {
    addAfter(document.descendantWithPath('dependencyManagement'), "\n"+pluginRepositoriesCode);
  } else {
    const hasRepo = pluginRepositories.childrenNamed('pluginRepository').find((repo) => {
      const url = repo.descendantWithPath('url').children[0].text;
      return (
        url.trim() === 'https://maven.vaadin.com/vaadin-prereleases' ||
        url.trim() === 'https://maven.vaadin.com/vaadin-prereleases/'
      );
    });
    if (!hasRepo) {
      addAsFirstChild(pluginRepositories, "\n"+pluginRepositoryCode);
    }
  }
}

// Plugin name and version
replacePlugin(document, flowVersion, isHilla);

const profiles = document.descendantWithPath('profiles');
profiles.childrenNamed('profile').forEach((profile) => {
  replacePlugin(profile, flowVersion, isHilla);
});

// Replace and write
replacements.sort((a, b) => {
  if (a.position < b.position) {
    return 1;
  } else {
    return -1;
  }
});
let output = data;
replacements.forEach((replacement) => {
  if (debug) {
    console.log(
      'Replacing ' + output.substr(replacement.position, replacement.length) + ' with ' + replacement.replacement
    );
  }
  output =
    output.substr(0, replacement.position) +
    replacement.replacement +
    output.substr(replacement.position + replacement.length);
});

fs.writeFileSync('pom.xml', output);
