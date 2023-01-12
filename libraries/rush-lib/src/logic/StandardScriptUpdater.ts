// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, Async } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import {
  installRunRushScriptFilename,
  installRunRushxScriptFilename,
  installRunRushPnpmScriptFilename,
  installRunScriptFilename,
  scriptsFolderPath
} from '../utilities/PathConstants';

const HEADER_LINES_PREFIX: string[] = [
  '// THIS FILE WAS GENERATED BY A TOOL. ANY MANUAL MODIFICATIONS WILL GET OVERWRITTEN WHENEVER RUSH IS UPGRADED.',
  '//'
];

const HEADER_LINES_SUFFIX: string[] = [
  '//',
  '// For more information, see: https://rushjs.io/pages/maintainer/setup_new_repo/',
  ''
];

interface IScriptSpecifier {
  scriptName: string;
  headerLines: string[];
}

const _scripts: IScriptSpecifier[] = [
  {
    scriptName: installRunScriptFilename,
    headerLines: [
      '// This script is intended for usage in an automated build environment where a Node tool may not have',
      '// been preinstalled, or may have an unpredictable version.  This script will automatically install the specified',
      '// version of the specified tool (if not already installed), and then pass a command-line to it.',
      '// An example usage would be:',
      '//',
      `//    node common/scripts/${installRunScriptFilename} qrcode@1.2.2 qrcode https://rushjs.io`
    ]
  },
  {
    scriptName: installRunRushScriptFilename,
    headerLines: [
      '// This script is intended for usage in an automated build environment where the Rush command may not have',
      '// been preinstalled, or may have an unpredictable version.  This script will automatically install the version of Rush',
      '// specified in the rush.json configuration file (if not already installed), and then pass a command-line to it.',
      '// An example usage would be:',
      '//',
      `//    node common/scripts/${installRunRushScriptFilename} install`
    ]
  },
  {
    scriptName: installRunRushxScriptFilename,
    headerLines: [
      '// This script is intended for usage in an automated build environment where the Rush command may not have',
      '// been preinstalled, or may have an unpredictable version.  This script will automatically install the version of Rush',
      '// specified in the rush.json configuration file (if not already installed), and then pass a command-line to the',
      '// rushx command.',
      '//',
      '// An example usage would be:',
      '//',
      `//    node common/scripts/${installRunRushxScriptFilename} custom-command`
    ]
  }
];

const _pnpmOnlyScripts: IScriptSpecifier[] = [
  {
    scriptName: installRunRushPnpmScriptFilename,
    headerLines: [
      '// This script is intended for usage in an automated build environment where the Rush command may not have',
      '// been preinstalled, or may have an unpredictable version.  This script will automatically install the version of Rush',
      '// specified in the rush.json configuration file (if not already installed), and then pass a command-line to the',
      '// rush-pnpm command.',
      '//',
      '// An example usage would be:',
      '//',
      `//    node common/scripts/${installRunRushPnpmScriptFilename} pnpm-command`
    ]
  }
];

const getScripts = (rushConfiguration: RushConfiguration): IScriptSpecifier[] => {
  if (rushConfiguration.packageManager === 'pnpm') {
    return _scripts.concat(_pnpmOnlyScripts);
  }

  return _scripts;
};

/**
 * Checks whether the common/scripts files are up to date, and recopies them if needed.
 * This is used by the "rush install" and "rush update" commands.
 */
export class StandardScriptUpdater {
  /**
   * Recopy the scripts if the scripts are out of date.
   * Used by "rush update".
   */
  public static async updateAsync(rushConfiguration: RushConfiguration): Promise<boolean> {
    await FileSystem.ensureFolderAsync(rushConfiguration.commonScriptsFolder);

    let anyChanges: boolean = false;
    await Async.forEachAsync(
      getScripts(rushConfiguration),
      async (script: IScriptSpecifier) => {
        const changed: boolean = await StandardScriptUpdater._updateScriptOrThrowAsync(
          script,
          rushConfiguration,
          false
        );
        anyChanges ||= changed;
      },
      { concurrency: 10 }
    );

    if (anyChanges) {
      console.log(); // print a newline after the notices
    }

    return anyChanges;
  }

  /**
   * Throw an exception if the scripts are out of date.
   * Used by "rush install".
   */
  public static async validateAsync(rushConfiguration: RushConfiguration): Promise<void> {
    await Async.forEachAsync(
      getScripts(rushConfiguration),
      async (script: IScriptSpecifier) => {
        await StandardScriptUpdater._updateScriptOrThrowAsync(script, rushConfiguration, true);
      },
      { concurrency: 10 }
    );
  }

  /**
   * Compares a single script in the common/script folder to see if it needs to be updated.
   * If throwInsteadOfCopy=false, then an outdated or missing script will be recopied;
   * otherwise, an exception is thrown.
   */
  private static async _updateScriptOrThrowAsync(
    script: IScriptSpecifier,
    rushConfiguration: RushConfiguration,
    throwInsteadOfCopy: boolean
  ): Promise<boolean> {
    const targetFilePath: string = `${rushConfiguration.commonScriptsFolder}/${script.scriptName}`;

    // Are the files the same?
    let filesAreSame: boolean = false;

    let targetContent: string | undefined;
    try {
      targetContent = await FileSystem.readFileAsync(targetFilePath);
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }
    const targetNormalized: string | undefined = targetContent
      ? StandardScriptUpdater._normalize(targetContent)
      : undefined;

    let sourceNormalized: string;
    if (targetNormalized) {
      sourceNormalized = await StandardScriptUpdater._getExpectedFileDataAsync(script);
      if (sourceNormalized === targetNormalized) {
        filesAreSame = true;
      }
    }

    if (!filesAreSame) {
      if (throwInsteadOfCopy) {
        throw new Error(
          'The standard files in the "common/scripts" folders need to be updated' +
            ' for this Rush version.  Please run "rush update" and commit the changes.'
        );
      } else {
        console.log(`Script is out of date; updating "${targetFilePath}"`);
        sourceNormalized ||= await StandardScriptUpdater._getExpectedFileDataAsync(script);
        await FileSystem.writeFileAsync(targetFilePath, sourceNormalized);
      }
    }

    return !filesAreSame;
  }

  private static _normalize(content: string): string {
    // Ignore newline differences from .gitattributes
    return (
      content
        .split('\n')
        // Ignore trailing whitespace
        .map((x) => x.trimRight())
        .join('\n')
    );
  }

  private static async _getExpectedFileDataAsync({
    scriptName,
    headerLines
  }: IScriptSpecifier): Promise<string> {
    const sourceFilePath: string = `${scriptsFolderPath}/${scriptName}`;
    let sourceContent: string = await FileSystem.readFileAsync(sourceFilePath);
    sourceContent = [...HEADER_LINES_PREFIX, ...headerLines, ...HEADER_LINES_SUFFIX, sourceContent].join(
      '\n'
    );
    const sourceNormalized: string = StandardScriptUpdater._normalize(sourceContent);
    return sourceNormalized;
  }
}
