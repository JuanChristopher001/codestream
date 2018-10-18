"use strict";

import {
	BaseIndex,
	encodeArray,
	GroupIndex,
	IndexParams,
	IndexType,
	makeIndex,
	UniqueIndex
} from "./index";

import { Logger } from "../../logger";
import { Strings } from "../../system/string";
import { Id } from "../entityManager";

export type UniqueFetchFn<T> = (criteria: KeyValue<T>[]) => Promise<T | undefined>;
export type GroupFetchFn<T> = (criteria: KeyValue<T>[]) => Promise<T[]>;
export type FetchFn<T> = UniqueFetchFn<T> | GroupFetchFn<T>;

export type IdFn<T> = (obj: T) => Id;

export type KeyValue<T> = [keyof T, any];

export function getKeys<T>(keyValues: KeyValue<T>[]): (keyof T)[] {
	return keyValues.map(kv => kv[0]);
}

export function getValues<T>(keyValues: KeyValue<T>[]): any[] {
	return keyValues.map(kv => kv[1]);
}

export class BaseCache<T> {
	protected readonly indexes: Map<string, BaseIndex<T>>;

	/**
	 * Create a cache
	 *
	 * @param idxFields Indexed fields
	 */
	constructor(idxFields: IndexParams<T>[]) {
		const indexes = new Map();
		for (const idxField of idxFields) {
			indexes.set(encodeArray(idxField.fields), makeIndex(idxField));
		}
		this.indexes = indexes;
	}

	invalidate() {
		for (const [field, index] of this.indexes.entries()) {
			Logger.debug(`${Logger.toLoggableName(this)}: Invalidating index ${field}`);
			index.invalidate();
		}
	}

	/**
	 * Get an entity by field. Requires an unique index.
	 *
	 * @param criteria Search criteria as an array of key/value tuples
	 *
	 * @return Entity or `undefined`
	 */
	async get(
		criteria: KeyValue<T>[],
		options: { fromCacheOnly?: boolean } = {}
	): Promise<T | undefined> {
		const start = process.hrtime();
		const keys = getKeys(criteria);
		const index = this.getIndex<UniqueIndex<T>>(keys);
		const values = getValues(criteria);
		if (!index || index.type !== IndexType.Unique) {
			throw new Error(`No unique index declared for fields ${keys}`);
		}

		Logger.log(`BaseCache: retrieving entity ${keys}=${values}`);
		let entity = index.get(values);
		if (!entity && options.fromCacheOnly !== true) {
			Logger.log(`BaseCache: cache miss ${keys}=${values}`);
			const fetch = index.fetchFn as UniqueFetchFn<T>;
			entity = await fetch(criteria);
			Logger.log(`BaseCache: caching entity ${keys}=${values}`);
			this.set(entity);
		} else if (entity) {
			Logger.log(`BaseCache: cache hit ${keys}=${values}`);
		}

		Logger.log(
			`PostManager: returning entity in ${Strings.getDurationMilliseconds(
				start
			)}ms ${keys}=${values}`
		);
		return entity;
	}

	/**
	 * Add or update an entity. All initialized indexes are updated. In order to dissociate an
	 * updated entity from its old indexed values, #oldEntity must be specified.
	 *
	 * @param entity The entity
	 * @param oldEntity The old version of the entity
	 */
	set(entities: T[]): void;
	set(entity?: T, oldEntity?: T): void;
	set(entitiesOrEntity?: T | T[], oldEntity?: T): void {
		if (!entitiesOrEntity) {
			return;
		}

		if (Array.isArray(entitiesOrEntity)) {
			for (const entity of entitiesOrEntity) {
				if (!entity) continue;

				for (const index of this.indexes.values()) {
					index.set(entity);
				}
			}
		} else {
			for (const index of this.indexes.values()) {
				index.set(entitiesOrEntity, oldEntity);
			}
		}
	}

	/**
	 * Get a group of entities by field. Requires a group index.
	 *
	 * @param criteria Search criteria as an array of key/value tuples
	 *
	 * @return Array of entities or `undefined` if group is not initialized
	 */
	async getGroup(criteria: KeyValue<T>[]): Promise<T[]> {
		const start = process.hrtime();
		const keys = getKeys(criteria);
		const values = getValues(criteria);
		const index = this.getIndex<GroupIndex<T>>(keys);
		if (!index || index.type !== IndexType.Group) {
			throw new Error(`No group index declared for field ${keys}`);
		}

		Logger.log(`BaseCache: retrieving entities ${keys}=${values}`);
		let entities = index.getGroup(values);
		if (!entities) {
			Logger.log(`BaseCache: cache miss ${keys}=${values}`);
			const fetch = index.fetchFn as GroupFetchFn<T>;
			entities = await fetch(criteria);
			Logger.log(`BaseCache: caching entities ${keys}=${values}`);
			this.initGroup(criteria, entities);
		} else {
			Logger.log(`BaseCache: cache hit ${keys}=${values}`);
		}

		Logger.log(
			`BaseCache: returning ${entities.length} entities in ${Strings.getDurationMilliseconds(
				start
			)}ms ${keys}=${values}`
		);
		return entities;
	}

	/**
	 * Initializes a group of entities. For group indexes, all entities must be specified.
	 *
	 * @param groupField The group field
	 * @param groupValue The group field value
	 * @param entities Array of entities
	 */
	initGroup(criteria: KeyValue<T>[], entities: T[]) {
		const keys = getKeys(criteria);
		const values = getValues(criteria);
		const index = this.requireIndex<GroupIndex<T>>(keys);
		if (index.type !== IndexType.Group) {
			throw new Error(
				`Cannot initialize group ${keys}=${values} because it doesn't have an associated group index`
			);
		}

		for (const entity of entities) {
			this.set(entity);
		}
		index.initGroup(values, entities);
	}

	protected requireIndex<I extends BaseIndex<T>>(keys: (keyof T)[]): I {
		const index = this.getIndex<I>(keys);
		if (index == null) {
			throw new Error(`No index declared for field ${keys}`);
		}
		return index;
	}

	private getIndex<I extends BaseIndex<T>>(fields: (keyof T)[]): I | undefined {
		return this.indexes.get(encodeArray(fields)) as I;
	}
}
