/**
 * External dependencies
 */
import type { FormEvent, HTMLElementEvent } from 'react';
import { store, getContext } from '@wordpress/interactivity';
import type {
	Store as WooCommerce,
	SelectedAttributes,
	ProductData,
} from '@woocommerce/stores/woocommerce/cart';
import '@woocommerce/stores/woocommerce/product-data';
import type { Store as StoreNotices } from '@woocommerce/stores/store-notices';

/**
 * Internal dependencies
 */
import {
	getMatchedVariation,
	type AvailableVariation,
} from '../../base/utils/variations/get-matched-variation';
import { doesCartItemMatchAttributes } from '../../base/utils/variations/does-cart-item-match-attributes';
import type { VariableProductAddToCartWithOptionsStore } from './variation-selector/frontend';

export type Context = {
	productId: number;
	productType: string;
	selectedAttributes: SelectedAttributes[];
	availableVariations: AvailableVariation[];
	quantity: Record< number, number >;
	lastQuantity: number;
	tempQuantity: number;
	groupedProductIds: number[];
	childProductId: number;
	quantityConstraints: Record<
		number,
		{ min: number; max: number | null; step: number }
	>;
};

interface GroupedCartItem {
	id: number;
	quantity: number;
	variation: SelectedAttributes[];
	type: string;
}

// Stores are locked to prevent 3PD usage until the API is stable.
const universalLock =
	'I acknowledge that using a private store means my plugin will inevitably break on the next store release.';

const { state: wooState } = store< WooCommerce >(
	'woocommerce',
	{},
	{ lock: universalLock }
);

const getInputElementFromEvent = (
	event: HTMLElementEvent< HTMLButtonElement, HTMLInputElement >
) => {
	let inputElement = null;

	if ( event.target instanceof HTMLButtonElement ) {
		inputElement = event.target.parentElement?.querySelector( '.qty' );
	}

	if ( event.target instanceof HTMLInputElement ) {
		inputElement = event.target;
	}

	return inputElement;
};

const getConstraints = (
	product: ProductData & { id: number },
	defaults: {
		minValue?: number;
		maxValue?: number | null;
		step?: number;
	} = {}
) => {
	const minValue = product?.min_value || defaults.minValue || 1;
	const maxValue = product?.max_value || defaults.maxValue || null;
	const step = product?.step_value || defaults.step || 1;

	return {
		minValue,
		maxValue,
		step,
	};
};

const getInputData = (
	event: HTMLElementEvent< HTMLButtonElement, HTMLInputElement >
) => {
	const inputElement = getInputElementFromEvent( event );

	if ( ! inputElement ) {
		return;
	}

	const parsedValue = parseInt( inputElement.value, 10 );
	const childProductId = parseInt(
		inputElement.name.match( /\[(\d+)\]/ )?.[ 1 ] ?? '0',
		10
	);

	const currentValue = isNaN( parsedValue ) ? 0 : parsedValue;

	return {
		currentValue,
		childProductId,
		inputElement,
	};
};

const getNewQuantity = (
	productId: number,
	quantity: number,
	variation?: SelectedAttributes[]
) => {
	const product = wooState.cart?.items.find( ( item ) => {
		if ( item.type === 'variation' ) {
			// If it's a variation, check that attributes match.
			// While different variations have different attributes,
			// some variations might accept 'Any' value for an attribute,
			// in which case, we need to check that the attributes match.
			if (
				item.id !== productId ||
				! item.variation ||
				! variation ||
				item.variation.length !== variation.length
			) {
				return false;
			}
			return doesCartItemMatchAttributes( item, variation );
		}

		return item.id === productId;
	} );
	const currentQuantity = product?.quantity || 0;
	return currentQuantity + quantity;
};

const dispatchChangeEvent = ( inputElement: HTMLInputElement ) => {
	const event = new Event( 'change', { bubbles: true } );
	inputElement.dispatchEvent( event );
};

export type AddToCartWithOptionsStore = {
	state: {
		isFormValid: boolean;
		allowsDecrease: boolean;
		allowsIncrease: boolean;
	};
	actions: {
		setQuantity: ( value: number, childProductId?: number ) => void;
		increaseQuantity: (
			event: HTMLElementEvent< HTMLButtonElement >
		) => void;
		decreaseQuantity: (
			event: HTMLElementEvent< HTMLButtonElement >
		) => void;
		handleQuantityInput: (
			event: HTMLElementEvent< HTMLInputElement >
		) => void;
		handleQuantityChange: (
			event: HTMLElementEvent< HTMLInputElement >
		) => void;
		handleQuantityCheckboxChange: (
			event: HTMLElementEvent< HTMLInputElement >
		) => void;
		handleSubmit: ( event: FormEvent< HTMLFormElement > ) => void;
	};
};

const getProductObject = (
	id: number,
	productType: string,
	availableVariations: AvailableVariation[],
	selectedAttributes: SelectedAttributes[]
): ProductData & { id: number } => {
	if ( productType === 'variable' ) {
		const matchedVariation = getMatchedVariation(
			availableVariations,
			selectedAttributes
		);
		if ( matchedVariation?.variation_id ) {
			return {
				id: matchedVariation.variation_id,
				...wooState?.products?.[ id ]?.variations?.[
					matchedVariation?.variation_id
				],
			};
		}
	}

	return {
		id,
		...wooState?.products?.[ id ],
	};
};

const addToCartWithOptionsStore = store<
	AddToCartWithOptionsStore &
		Partial< VariableProductAddToCartWithOptionsStore >
>(
	'woocommerce/add-to-cart-with-options',
	{
		state: {
			get isFormValid(): boolean {
				const context = getContext< Context >();
				if ( ! context ) {
					return true;
				}

				const { productType, quantity } = context;

				if ( productType === 'variable' ) {
					return (
						addToCartWithOptionsStore?.state
							?.isVariableProductFormValid ?? true
					);
				}

				if ( productType === 'grouped' ) {
					return Object.values( quantity ).some( ( qty ) => qty > 0 );
				}

				return true;
			},
			get allowsDecrease() {
				const {
					quantity,
					childProductId,
					productType,
					productId,
					availableVariations,
					selectedAttributes,
				} = getContext< Context >();

				const id = childProductId || productId;
				const productObject = getProductObject(
					id,
					productType,
					availableVariations,
					selectedAttributes
				);

				if ( ! productObject ) {
					return true;
				}

				const { minValue, step } = getConstraints( productObject, {
					minValue: childProductId ? 0 : 1,
				} );
				const currentQuantity = quantity[ productObject.id ] || 0;

				return currentQuantity - step >= minValue;
			},
			get allowsIncrease() {
				const {
					quantity,
					childProductId,
					productType,
					productId,
					availableVariations,
					selectedAttributes,
				} = getContext< Context >();

				const id = childProductId || productId;
				const productObject = getProductObject(
					id,
					productType,
					availableVariations,
					selectedAttributes
				);

				if ( ! productObject ) {
					return true;
				}

				const { maxValue, step } = getConstraints( productObject );
				const currentQuantity = quantity[ productObject.id ] || 0;

				return maxValue === null || currentQuantity + step <= maxValue;
			},
			get lastQuantity() {
				const context = getContext< Context >();
				console.log( context.lastQuantity );
				return context.lastQuantity;
			},
		},
		actions: {
			setQuantity( value: number, childProductId?: number ) {
				console.log( 'setQuantity', value );
				const context = getContext< Context >();

				if ( context.productType === 'variable' ) {
					// Set the quantity for all variations, so when switching
					// variations the quantity persists.
					const variationIds = context.availableVariations.map(
						( variation ) => variation.variation_id
					);

					const variationQuantities: Record< number, number > = {};
					variationIds.forEach( ( id ) => {
						variationQuantities[ id ] = value;
					} );

					context.quantity = {
						...context.quantity,
						...variationQuantities,
					};
				} else {
					const id = childProductId || context.productId;

					context.quantity = {
						...context.quantity,
						[ id ]: value,
					};
				}

				context.lastQuantity = value;
			},
			increaseQuantity: (
				event: HTMLElementEvent< HTMLButtonElement >
			) => {
				const inputData = getInputData( event );
				if ( ! inputData ) {
					return;
				}
				const { currentValue, childProductId, inputElement } =
					inputData;

				const {
					productId,
					productType,
					availableVariations,
					selectedAttributes,
				} = getContext< Context >();

				const id = childProductId || productId;

				const productObject = getProductObject(
					id,
					productType,
					availableVariations,
					selectedAttributes
				);

				if ( ! productObject ) {
					return;
				}

				const { minValue, maxValue, step } = getConstraints(
					productObject,
					{
						minValue: childProductId ? 0 : 1,
					}
				);

				const newValue = currentValue + step;

				if ( maxValue === null || newValue <= maxValue ) {
					const updatedValue = Math.max( minValue, newValue );
					addToCartWithOptionsStore.actions.setQuantity(
						updatedValue,
						childProductId
					);
					inputElement.value = updatedValue.toString();
					dispatchChangeEvent( inputElement );
				}
			},
			decreaseQuantity: (
				event: HTMLElementEvent< HTMLButtonElement >
			) => {
				const inputData = getInputData( event );
				if ( ! inputData ) {
					return;
				}
				const { currentValue, childProductId, inputElement } =
					inputData;

				const {
					productId,
					productType,
					availableVariations,
					selectedAttributes,
				} = getContext< Context >();

				const id = childProductId || productId;

				const productObject = getProductObject(
					id,
					productType,
					availableVariations,
					selectedAttributes
				);

				if ( ! productObject ) {
					return;
				}

				const { minValue, maxValue, step } = getConstraints(
					productObject,
					{
						minValue: childProductId ? 0 : 1,
					}
				);

				const newValue = currentValue - step;

				if ( newValue >= minValue ) {
					const updatedValue = Math.min(
						maxValue ?? Infinity,
						newValue
					);
					addToCartWithOptionsStore.actions.setQuantity(
						updatedValue,
						childProductId
					);
					inputElement.value = updatedValue.toString();
					dispatchChangeEvent( inputElement );
				}
			},
			handleQuantityInput: (
				event: HTMLElementEvent< HTMLInputElement >
			) => {
				const inputData = getInputData( event );
				if ( ! inputData ) {
					return;
				}
				const { childProductId, currentValue } = inputData;

				addToCartWithOptionsStore.actions.setQuantity(
					currentValue,
					childProductId
				);
			},
			handleQuantityChange: (
				event: HTMLElementEvent< HTMLInputElement >
			) => {
				const inputData = getInputData( event );
				if ( ! inputData ) {
					return;
				}
				const { childProductId, currentValue } = inputData;

				const {
					productId,
					productType,
					availableVariations,
					selectedAttributes,
				} = getContext< Context >();

				const id = childProductId || productId;

				const productObject = getProductObject(
					id,
					productType,
					availableVariations,
					selectedAttributes
				);

				if ( ! productObject ) {
					return;
				}

				const { minValue, maxValue } = getConstraints( productObject, {
					minValue: childProductId ? 0 : 1,
				} );

				const newValue = Math.min(
					maxValue ?? Infinity,
					Math.max( minValue, currentValue )
				);

				if ( event.target.value !== newValue.toString() ) {
					addToCartWithOptionsStore.actions.setQuantity(
						newValue,
						childProductId
					);
					event.target.value = newValue.toString();
					dispatchChangeEvent( event.target );
				}
			},
			handleQuantityCheckboxChange: (
				event: HTMLElementEvent< HTMLInputElement >
			) => {
				const inputData = getInputData( event );
				if ( ! inputData ) {
					return;
				}
				const { inputElement, childProductId } = inputData;

				addToCartWithOptionsStore.actions.setQuantity(
					inputElement.checked ? 1 : 0,
					childProductId
				);
			},
			*handleSubmit( event: FormEvent< HTMLFormElement > ) {
				event.preventDefault();

				// Todo: Use the module exports instead of `store()` once the
				// woocommerce store is public.
				yield import( '@woocommerce/stores/woocommerce/cart' );

				const {
					productId,
					quantity,
					selectedAttributes,
					productType,
					groupedProductIds,
				} = getContext< Context >();

				if (
					productType === 'grouped' &&
					groupedProductIds.length > 0
				) {
					const addedItems: GroupedCartItem[] = [];

					for ( const childProductId of groupedProductIds ) {
						if ( quantity[ childProductId ] === 0 ) {
							continue;
						}

						const newQuantity = getNewQuantity(
							childProductId,
							quantity[ childProductId ]
						);

						addedItems.push( {
							id: childProductId,
							quantity: newQuantity,
							variation: selectedAttributes,
							type: productType,
						} );
					}

					if ( addedItems.length === 0 ) {
						// Todo: Use the module exports instead of `store()` once the store-notices
						// store is public.
						yield import( '@woocommerce/stores/store-notices' );
						const { actions: noticeActions } =
							store< StoreNotices >(
								'woocommerce/store-notices',
								{},
								{
									lock: 'I acknowledge that using a private store means my plugin will inevitably break on the next store release.',
								}
							);

						const errorMessage =
							wooState?.errorMessages
								?.groupedProductAddToCartMissingItems;

						if ( errorMessage ) {
							noticeActions.addNotice( {
								notice: errorMessage,
								type: 'error',
								dismissible: true,
							} );
						}

						return;
					}

					const { actions } = store< WooCommerce >(
						'woocommerce',
						{},
						{ lock: universalLock }
					);

					yield actions.batchAddCartItems( addedItems );
				} else {
					const { variationId } = addToCartWithOptionsStore.state;
					const id = variationId || productId;
					const newQuantity = getNewQuantity(
						id,
						quantity[ id ],
						selectedAttributes
					);

					const { actions } = store< WooCommerce >(
						'woocommerce',
						{},
						{ lock: universalLock }
					);
					yield actions.addCartItem( {
						id,
						quantity: newQuantity,
						variation: selectedAttributes,
						type: productType,
					} );
				}
			},
		},
	},
	{ lock: true }
);
