/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as appInsights from 'applicationinsights';
import * as chalk from 'chalk';
import * as _ from 'lodash';
import * as opn from 'opn';
import * as uuid from 'uuid/v4';
import * as yosay from 'yosay';
import * as yo from 'yeoman-generator';

import generateStarterCode from './config/starterCode';
import { log } from 'util';

let insight = appInsights.getClient('1ced6a2f-b3b2-4da5-a1b8-746512fbc840');
const excelFunctions = `Excel Custom Functions (Preview: Requires the Insider channel for Excel)`;

// Remove unwanted tags
delete insight.context.tags['ai.cloud.roleInstance'];
delete insight.context.tags['ai.device.osVersion'];
delete insight.context.tags['ai.device.osArchitecture'];
delete insight.context.tags['ai.device.osPlatform'];

const manifest = 'Manifest';
const typescript = `Typescript`;
const javascript = `Javascript`;

module.exports = yo.extend({
  /**
   * Setup the generator
   */
  constructor: function () {
    yo.apply(this, arguments);

    this.argument('projectType', { type: String, required: false }); 
    this.argument('name', { type: String, required: false }); 
    this.argument('host', { type: String, required: false });

    this.option('skip-install', {
      type: Boolean,
      required: false,
      desc: 'Skip running `npm install` post scaffolding.'
    });

    this.option('js', {
      type: Boolean,
      required: false,
      desc: 'Project uses JavaScript instead of TypeScript.'
    });

    this.option('ts', {
      type: Boolean,
      required: false,
      desc: 'Project uses JavaScript instead of TypeScript.'
    });

    this.option('output', {
      alias: 'o',
      type: String,
      required: false,
      desc: 'Project folder name if different from project name.'
    });

    this.option('details', {
      alias: 'd',
      type: Boolean,
      required: false,
      desc: 'Get more details on Yo Office arguments.'
    });
  },

  /**
   * Generator initalization
   */
  initializing: function () {
    if (this.options.details){
     this._detailedHelp();
    }
    let message = `Welcome to the ${chalk.bold.green('Office Add-in')} generator, by ${chalk.bold.green('@OfficeDev')}! Let\'s create a project together!`;
    this.log(yosay(message));
    this.project = {};
  },

  /**
   * Prompt users for options
   */
  prompting: async function () {
    try {
      let jsTemplates = getDirectories(this.templatePath('js')).map(template => _.capitalize(template));
      let tsTemplates = getDirectories(this.templatePath('ts')).map(template => _.capitalize(template));
      jsTemplates.push(`Manifest`);
      tsTemplates.push(`Manifest`);
      tsTemplates.push(excelFunctions);    
      let allTemplates = tsTemplates;
      let hosts = getDirectories(this.templatePath('hosts')).map(host=> _.capitalize(host));;
      updateHostNames(hosts, 'Onenote', 'OneNote');
      updateHostNames(hosts, 'Powerpoint', 'PowerPoint');
      let isManifestProject = false;
      let isExcelFunctionsProject = false;

      /** askForProjectType will only be triggered if no project type was specified via command line projectType argument,
       * and the projectType argument input was indeed valid */
      let startForProjectType = (new Date()).getTime();
      let askForProjectType = [
        {
          name: 'projectType',
          message: 'Choose a project type:',
          type: 'list',
          default: 'React',
          choices: allTemplates.map(template => ({ name: template, value: template })),
          when: this.options.projectType == null || !this._isValidInput(this.options.projectType, tsTemplates, false /* isHostParam */)
        }
      ];
      let answerForProjectType = await this.prompt(askForProjectType);
      let endForProjectType = (new Date()).getTime();
      let durationForProjectType = (endForProjectType - startForProjectType) / 1000;
      
      // Set isManifestProject to true if Manifest project type selected from prompt or Manifest was specified via the command prompt
      if ((answerForProjectType.projectType != null && answerForProjectType.projectType == manifest)
      || (this.options.projectType != null && this.options.projectType) == manifest) { 
          isManifestProject = true; }

      // Set isExcelFunctionsProject to true if ExcelexcelFunctions project type selected from prompt or ExcelexcelFunctions was specified via the command prompt
      if ((answerForProjectType.projectType != null  && answerForProjectType.projectType) == excelFunctions
      || (this.options.projectType != null && this.options.projectType == excelFunctions)) { 
        isExcelFunctionsProject = true; }

      /** askForTs and askForProjectType will only be triggered if the js param is null, it's not a Manifest project,
       * it's not an ExcelexcelFunctions project and the project type exists for both script types */      
      let startForScriptType = (new Date()).getTime();
      let askForScriptType = [
        {
          name: 'scriptType',
          type: 'list',
          message: 'Choose a script type',
          choices: [typescript, javascript],
          default: typescript,
          when: this.options.js == null  && this.options.ts == null && !isManifestProject && !isExcelFunctionsProject
          && (this.options.projectType != null && this._projectBothScriptTypes(this.options.projectType, jsTemplates)
          || answerForProjectType.projectType != null && this._projectBothScriptTypes(answerForProjectType.projectType, jsTemplates))
        }
      ];
      let answerForScriptType = await this.prompt(askForScriptType);
      let endForScriptType = (new Date()).getTime();
      let durationForScriptType = (endForScriptType - startForScriptType) / 1000;         

      /** askforName will be triggered if no project name was specified via command line Name argument */
      let startForName = (new Date()).getTime();
      let askForName = [{
        name: 'name',
        type: 'input',
        message: 'What do you want to name your add-in?',
        default: 'My Office Add-in',
        when: this.options.name == null
      }];
      let answerForName = await this.prompt(askForName);
      let endForName = (new Date()).getTime();
      let durationForName = (endForName - startForName) / 1000; 

      /** askForHost will be triggered if no project name was specified via the command line Host argument, and the Host argument
       * input was in fact valid, and the project type is not Excel-Functions */
      let startForHost = (new Date()).getTime();
      let askForHost = [{
        name: 'host',
        message: 'Which Office client application would you like to support?',
        type: 'list',
        default: 'Excel',
        choices: hosts.map(host => ({ name: host, value: host })),
        when: (this.options.host == null || this.options.host != null && !this._isValidInput(this.options.host, hosts, true /* isHostParam */))
        && !isExcelFunctionsProject
      }];
      let answerForHost = await this.prompt(askForHost);
      let endForHost = (new Date()).getTime();
      let durationForHost = (endForHost - startForHost) / 1000;

       /**
       * Configure project properties based on user input or answers to prompts
       */
      this.project = {
        folder: this.options.output || answerForName.name || this.options.name,
        name: this.options.name || answerForName.name,
        host: this.options.host || answerForHost.host,
        projectType: this.options.projectType || answerForProjectType.projectType,
        isManifestOnly: isManifestProject,
        isExcelFunctionsProject: isExcelFunctionsProject,
        scriptType: answerForScriptType.scriptType
      };

      if (this.options.js) {
        this.project.scriptType = javascript; }

      // Ensure script type is set to Typescript if the project type is React or ExcelexcelFunctions
      if (this.project.projectType === 'React' || this.project.projectType === excelFunctions) {
        this.project.scriptType = typescript; }

      if (this.options.output != null) {
        this.project.folder = this.options.output; }
  
      /** appInsights logging */
      const noElapsedTime = 0;
      insight.trackEvent('Name', { Name: this.project.name }, { durationForName });
      insight.trackEvent('Folder', { CreatedSubFolder: this.project.folder.toString() }, { noElapsedTime }); 
      insight.trackEvent('Host', { Host: this.project.host }, { durationForHost });    
      insight.trackEvent('ScriptType', { ScriptType: this.project.scriptType }, { noElapsedTime });      
      insight.trackEvent('IsManifestOnly', { IsManifestOnly: this.project.isManifestOnly.toString() }, { noElapsedTime });
      insight.trackEvent('ProjectType', { ProjectType: this.project.projectType }, { durationForProjectType });
    } catch (err) {
      insight.trackException(new Error('Prompting Error: ' + err));
    }
  },

  /**
   * save configs & config project
   */
  configuring: function () {
    try {
      this.project.projectInternalName = _.kebabCase(this.project.name);
      this.project.projectDisplayName = this.project.name;
      this.project.projectId = uuid();
      if (this.project.projectType === excelFunctions) {
        this.project.host = 'Excel';
        this.project.hostInternalName = 'Excel';
      }
      else {
        this.project.hostInternalName = this.project.host;
      }      
      this.destinationRoot(this.project.folder);

      /** Check to to see if destination folder already exists. If so, we will exit and prompt the user to provide
      a different project name or output folder */
      this._exitYoOfficeIfProjectFolderExists();

      let duration = this.project.duration;
      insight.trackEvent('App_Data', { AppID: this.project.projectId, Host: this.project.host, ProjectType: this.project.projectType, isTypeScript: (this.project.scriptType === typescript).toString() }, { duration });
    } catch (err) {
      insight.trackException(new Error('Configuration Error: ' + err));
    }
  },

  writing: function () {
    this._copyProjectFiles();
  },

  install: function () {
    try {      
      if (this.options['skip-install']) {
        this.installDependencies({
          npm: false,
          bower: false,
          callback: this._postInstallHints.bind(this)
        });
      }
      else {
        this.installDependencies({
          npm: true,
          bower: false,
          callback: this._postInstallHints.bind(this)
        });
      }
    } catch (err) {
      insight.trackException(new Error('Installation Error: ' + err));
      process.exitCode = 1;
    }
  },

  _detailedHelp: function () {
    this.log(`\nYo Office ${chalk.bgGreen('Arguments')} and ${chalk.magenta('Values')} NOTE: Arguments must be specified in the below order.\n`);
    this.log(`  ${chalk.bgGreen('projectType')}:Specifies the type of project to create.`);
    this.log(`    ${chalk.yellow('angular:')}  Creates Office add-in using Angular framework`);
    this.log(`    ${chalk.yellow('excel-functions:')} Creates Office add-in for Excel custom functions`);
    this.log(`    ${chalk.yellow('jquery:')} Creates Office add-in using Jquery framework`);
    this.log(`    ${chalk.yellow('manifest:')} Creates only the manifest file for an Office add-in`);
    this.log(`    ${chalk.yellow('react:')} Creates Office add-in using React framework\n`);
    this.log(`  ${chalk.bgGreen('name')}:Specifies the name for the project that will be created.\n`);
    this.log(`  ${chalk.bgGreen('host')}:Specifies the host app in the add-in manifest.`);
    this.log(`    ${chalk.yellow('excel:')}  Creates Office add-in for Excel`);
    this.log(`    ${chalk.yellow('onenote:')} Creates Office add-in for OneNote`);
    this.log(`    ${chalk.yellow('outlook:')} Creates Office add-in for Outlook`);
    this.log(`    ${chalk.yellow('powerpoint:')} Creates Office add-in for PowerPoint`);
    this.log(`    ${chalk.yellow('project:')} Creates Office add-in for Project`);
    this.log(`    ${chalk.yellow('word:')} Creates Office add-in for Word\n`);
    this._exitProcess();
  },

  _postInstallHints: function () {
    /** Next steps and npm commands */
    this.log('----------------------------------------------------------------------------------------------------------\n');
    this.log(`      ${chalk.green('Congratulations!')} Your add-in has been created! Your next steps:\n`);
    this.log(`      1. Launch your local web server via ${chalk.inverse(' npm start ')} (you may also need to`);
    this.log(`         trust the Self-Signed Certificate for the site if you haven't done that)`);
    this.log(`      2. Sideload the add-in into your Office application.\n`);
    this.log(`      Please refer to resource.html in your project for more information.`);
    this.log(`      Or visit our repo at: https://github.com/officeDev/generator-office \n`);
    this.log('----------------------------------------------------------------------------------------------------------\n');
    this._exitProcess();
  },

  _projectBothScriptTypes: function (input, jsTemplates)
  {
    // Loop through jsTemplates, which is a subset of tsTemplates, and see if the project type exists
    for (var i = 0; i < jsTemplates.length; i++)
    {
      var element = jsTemplates[i];
      if (_.toLower(input) == _.toLower(element)) {
        return true;
      } 
    }
    return false;
  },

  _copyProjectFiles()
  {
      try {
        let language = this.project.scriptType  === typescript ? 'ts' : 'js';

        /** Show type of project creating in progress */
        if (this.project.isManifestOnly) {
          this.log('----------------------------------------------------------------------------------\n');  
          this.log(`      Creating manifest for ${chalk.bold.green(this.project.projectDisplayName)} at ${chalk.bold.magenta(this._destinationRoot)}\n`);  
          this.log('----------------------------------------------------------------------------------\n\n');  
        }
        else {
          this.log('\n----------------------------------------------------------------------------------\n');
          this.log(`      Creating ${chalk.bold.green(this.project.projectDisplayName)} add-in for ${chalk.bold.magenta(this.project.host)} using ${chalk.bold.yellow(this.project.scriptType)} at ${chalk.bold.magenta(this._destinationRoot)}\n`);
          this.log('----------------------------------------------------------------------------------\n\n');
          }          

        const starterCode = generateStarterCode(this.project.host);
        const templateFills = Object.assign({}, this.project, starterCode);

        /** Copy the manifest */
        if (!this.project.isExcelFunctionsProject) {
          this.fs.copyTpl(this.templatePath(`hosts/${_.toLower(this.project.hostInternalName)}/manifest.xml`), this.destinationPath(`${this.project.projectInternalName}-manifest.xml`), templateFills);
          }

        if (this.project.isManifestOnly) {
          this.fs.copyTpl(this.templatePath(`manifest-only/**`), this.destinationPath(), templateFills);
        }
        else 
        {          
          if (this.project.isExcelFunctionsProject){
            this.fs.copyTpl(this.templatePath(`excel-custom-functions-preview/**`), this.destinationPath(), templateFills, null, { globOptions: { ignore: `**/*.placeholder` }});
            this.fs.copy(this.templatePath(`${language}/base/certs`), this.destinationPath('certs'), { globOptions: { ignore: `**/*.placeholder` }});         
          }
          else 
          {
            /** Copy the base template */
            this.fs.copy(this.templatePath(`${language}/base/**`), this.destinationPath(), { globOptions: { ignore: `**/*.placeholder` }});

            /** Copy the project type specific overrides */
            this.fs.copyTpl(this.templatePath(`${language}/${_.toLower(this.project.projectType)}/**`), this.destinationPath(), templateFills, null, { globOptions: { ignore: `**/*.placeholder` }});
          
            /** Manually copy any dot files as yoeman can't handle them */
            /** .babelrc */
            const babelrcPath = this.templatePath(`${language}/${this.project.projectType}/babelrc.placeholder`);
            if (this.fs.exists(babelrcPath)) {
              this.fs.copy(babelrcPath, this.destinationPath('.babelrc'));
          }
        
          /** .gitignore */
          const gitignorePath = this.templatePath(`${language}/base/gitignore.placeholder`);
          if (this.fs.exists(gitignorePath)) {
              this.fs.copy(gitignorePath, this.destinationPath('.gitignore'));
          }
        }
      }        
      } catch (err) {
        insight.trackException(new Error('File Copy Error: ' + err));
      }
  },

  _isValidInput: function (input, inputArray, isHostParam) 
  {
    if (!isHostParam && _.toLower(input) == 'excel-functions')
    {
      input = excelFunctions;
    }

    // validate host and project-type inputs
    for (var i = 0; i < inputArray.length; i++)
    {
      var element = inputArray[i];
      if (_.toLower(input) == _.toLower(element)) {
        if (isHostParam){
          this.options.host = element;
        }
        else {
          this.options.projectType = element;
        }
        return true;
      }
    }
    return false;
  },

_exitYoOfficeIfProjectFolderExists: function ()
  {      
    if (fs.existsSync(this._destinationRoot))
      {
        if (fs.readdirSync(this._destinationRoot).length > 0)
        {
          this.log(`${chalk.bold.red(`\nFolder already exists at ${chalk.bold.green(this._destinationRoot)} and is not empty. To avoid accidentally overwriting any files, please start over and choose a different project name or destination folder via the ${chalk.bold.magenta(`--output`)} parameter`)}\n`); 
          this._exitProcess(); 
        }
      }
      return false;
  },
  
  _exitProcess: function () {
    process.exit();
  }
} as any);

function getDirectories(root) {
  return fs.readdirSync(root).filter(file => {
    if (file === 'base') {
      return false;
    }
    return fs.statSync(path.join(root, file)).isDirectory();
  });
}

function getFiles(root) {
  return fs.readdirSync(root).filter(file => {
    return !(fs.statSync(path.join(root, file)).isDirectory());
  });
}

function updateHostNames(arr, key, newval) {
  let match = _.some(arr, _.method('match', key));
  if (match) {
    let index = _.indexOf(arr, key);
    arr.splice(index, 1, newval);
  }
}