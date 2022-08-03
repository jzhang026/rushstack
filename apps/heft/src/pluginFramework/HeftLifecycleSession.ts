// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import type { AsyncParallelHook } from 'tapable';

import type { IHeftRecordMetricsHookOptions, MetricsCollector } from '../metrics/MetricsCollector';
import type { ScopedLogger, IScopedLogger } from './logging/ScopedLogger';
import type { IInternalHeftSessionOptions } from './InternalHeftSession';
import type { IHeftParameters } from './HeftParameterManager';
import type { IDeleteOperation } from '../plugins/DeleteFilesPlugin';
import type { HeftPluginDefinitionBase } from '../configuration/HeftPluginDefinition';
import type { HeftPluginHost } from './HeftPluginHost';

/**
 * @public
 */
export interface IHeftLifecycleSession {
  /**
   * @public
   */
  readonly hooks: IHeftLifecycleHooks;

  /**
   * @public
   */
  readonly parameters: IHeftParameters;

  /**
   * @public
   */
  readonly cacheFolder: string;

  /**
   * @public
   */
  readonly tempFolder: string;

  /**
   * If set to true, the build is running with the --debug flag
   *
   * @public
   */
  readonly debugMode: boolean;

  /**
   * @public
   */
  readonly logger: IScopedLogger;

  /**
   * Set a a callback which will be called if and after the specified plugin has been applied.
   * This can be used to tap hooks on another lifecycle plugin that exists within the same phase.
   *
   * @public
   */
  requestAccessToPluginByName<T extends object>(
    pluginToAccessPackage: string,
    pluginToAccessName: string,
    pluginApply: (pluginAccessor: T) => void
  ): void;
}

/**
 * Hooks that are available to the lifecycle plugin.
 *
 * @public
 */
export interface IHeftLifecycleHooks {
  clean: AsyncParallelHook<IHeftLifecycleCleanHookOptions>;
  toolStart: AsyncParallelHook<IHeftLifecycleToolStartHookOptions>;
  toolStop: AsyncParallelHook<IHeftLifecycleToolStopHookOptions>;
  recordMetrics: AsyncParallelHook<IHeftRecordMetricsHookOptions>;
}

/**
 * Options provided to the clean hook.
 *
 * @public
 */
export interface IHeftLifecycleCleanHookOptions {
  addDeleteOperations: (...deleteOperations: IDeleteOperation[]) => void;
}

/**
 * Options provided to the toolStart hook.
 *
 * @public
 */
export interface IHeftLifecycleToolStartHookOptions {}

/**
 * Options provided to the toolStop hook.
 *
 * @public
 */
export interface IHeftLifecycleToolStopHookOptions {}

export interface IHeftLifecycleSessionOptions extends IInternalHeftSessionOptions {
  logger: ScopedLogger;
  lifecycleHooks: IHeftLifecycleHooks;
  lifecycleParameters: IHeftParameters;
  pluginDefinition: HeftPluginDefinitionBase;
  pluginHost: HeftPluginHost;
}

export class HeftLifecycleSession implements IHeftLifecycleSession {
  private _options: IHeftLifecycleSessionOptions;
  private _pluginHost: HeftPluginHost;

  public readonly hooks: IHeftLifecycleHooks;
  public readonly parameters: IHeftParameters;
  public readonly cacheFolder: string;
  public readonly tempFolder: string;
  public readonly logger: IScopedLogger;

  public get debugMode(): boolean {
    return this._options.debug;
  }

  /**
   * @internal
   */
  public readonly metricsCollector: MetricsCollector;

  public constructor(options: IHeftLifecycleSessionOptions) {
    this._options = options;
    this.logger = options.logger;
    this.metricsCollector = options.metricsCollector;
    this.hooks = options.lifecycleHooks;
    this.parameters = options.lifecycleParameters;

    // Guranteed to be unique since phases are forbidden from using the name 'lifecycle'
    // and lifecycle plugin names are enforced to be unique.
    const uniquePluginFolderName: string = `lifecycle.${options.pluginDefinition.pluginName}`;

    // <projectFolder>/.cache/<phaseName>.<taskName>
    this.cacheFolder = path.join(options.heftConfiguration.cacheFolder, uniquePluginFolderName);

    // <projectFolder>/temp/<phaseName>.<taskName>
    this.tempFolder = path.join(options.heftConfiguration.tempFolder, uniquePluginFolderName);

    this._pluginHost = options.pluginHost;
  }

  public requestAccessToPluginByName<T extends object>(
    pluginToAccessPackage: string,
    pluginToAccessName: string,
    pluginApply: (pluginAccessor: T) => void
  ): void {
    const { pluginPackageName, pluginName } = this._options.pluginDefinition;
    const pluginHookName: string = this._pluginHost.getPluginHookName(pluginPackageName, pluginName);
    this._pluginHost.requestAccessToPluginByName(
      pluginHookName,
      pluginToAccessPackage,
      pluginToAccessName,
      pluginApply
    );
  }
}
