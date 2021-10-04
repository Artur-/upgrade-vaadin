#!/usr/bin/env node

const xmldoc = require('xmldoc');

const fs = require('fs');

const replaceValue = (node, text) => {
  replacements.push({ position: node.position, length: node.val.length, replacement: text });
};
const addAsFirstChild = (node, text) => {
  replacements.push({ position: node.position, length: 0, replacement: text });
};
const addAfter = (node, data, text) => {
  const find = `${node.name}>`;
  const endOfNode = data.indexOf(find, node.position) + find.length;
  replacements.push({
    position: endOfNode,
    length: 0,
    replacement: text,
  });
};

const replacePlugin = (node) => {
  const buildPlugins = node.descendantWithPath('build.plugins');
  buildPlugins.childrenNamed('plugin').forEach((plugin) => {
    const artifactId = plugin.descendantWithPath('artifactId');
    if (artifactId.val === 'vaadin-maven-plugin') {
      replaceValue(artifactId, 'flow-maven-plugin');
      replaceValue(plugin.descendantWithPath('version'), '${flow.version}');
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
let flowVersionHandled = false;
properties.eachChild((property) => {
  if (property.name === 'vaadin.version') {
    replaceValue(property, vaadinVersion);
    vaadinVersionNode = property;
  } else if (property.name === 'flow.version') {
    replacements.push({ position: property.position, length: property.val.length, replacement: flowVersion });
    flowVersionHandled = true;
  }
});

if (vaadinVersionNode === undefined) {
  console.error('No vaadin.version property found. Is this a Vaadin project?');
  return;
}

if (!flowVersionHandled) {
  addAfter(vaadinVersionNode, data, '\n' + indent.repeat(2) + `<flow.version>${flowVersion}</flow.version>`);
}

// Dependency management
const dependencyManagement = document.descendantWithPath('dependencyManagement.dependencies');
let flowBomHandled = false;
let vaadinBomNode = undefined;

dependencyManagement.eachChild((dependency) => {
  if (dependency.valueWithPath('artifactId') === 'vaadin-bom') {
    vaadinBomNode = dependency;
  } else if (dependency.valueWithPath('artifactId') === 'flow-bom') {
    flowBomHandled = true;
    return;
  }
});
if (vaadinBomNode === undefined) {
  console.log('No vaadin-bom dependency found. Is this a Vaadin project?');
  return;
}
if (!flowBomHandled) {
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

// Plugin name and version
replacePlugin(document);

const profiles = document.descendantWithPath('profiles');
profiles.childrenNamed('profile').forEach((profile) => {
  replacePlugin(profile);
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
  //   console.log(
  //     'Replacing ' + output.substr(replacement.position, replacement.length) + ' with ' + replacement.replacement
  //   );
  output =
    output.substr(0, replacement.position) +
    replacement.replacement +
    output.substr(replacement.position + replacement.length);
});
fs.writeFileSync('pom.xml.out', output);
