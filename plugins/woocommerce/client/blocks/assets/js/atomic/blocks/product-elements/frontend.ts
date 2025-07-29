/**
 * External dependencies
 */
import { getElement, store, getContext } from '@wordpress/interactivity';
import '@woocommerce/stores/woocommerce/product-data';
import type { ProductDataStore } from '@woocommerce/stores/woocommerce/product-data';
import type { Store as WooCommerce } from '@woocommerce/stores/woocommerce/cart';
import { sanitize } from 'dompurify'; // eslint-disable-line import/named

// Stores are locked to prevent 3PD usage until the API is stable.
const universalLock =
	'I acknowledge that using a private store means my plugin will inevitably break on the next store release.';

const { state: wooState } = store< WooCommerce >(
	'woocommerce',
	{},
	{ lock: universalLock }
);

const { state: productDataState } = store< ProductDataStore >(
	'woocommerce/product-data',
	{},
	{ lock: universalLock }
);

const ALLOWED_TAGS = [
	'a',
	'b',
	'em',
	'i',
	'strong',
	'p',
	'br',
	'span',
	'bdi',
	'del',
	'ins',
];
const ALLOWED_ATTR = [
	'class',
	'target',
	'href',
	'rel',
	'name',
	'download',
	'aria-hidden',
];

export type Context = {
	productElementKey: // @todo rename 'productElementKey' to something else.
	'price_html' | 'availability' | 'sku' | 'weight' | 'dimensions';
	attributes: {
		min?: 'min_value';
	};
};

const productElementStore = store(
	'woocommerce/product-elements',
	{
		callbacks: {
			updateValue: () => {
				const element = getElement();

				if ( ! element.ref || ! productDataState?.productId ) {
					return;
				}

				const { productElementKey, attributes } =
					getContext< Context >();

				const elementsToUpdate = {
					innerHTML: productElementKey,
					...attributes,
				};

				Object.entries( elementsToUpdate ).forEach(
					( [ attribute, valueKey ] ) => {
						const { productId, variationId } = productDataState;

						if ( ! element.ref || ! productId ) {
							// @todo why TS needs this?
							return;
						}

						const value =
							wooState?.products?.[ productId ]?.variations?.[
								variationId || 0
							]?.[ valueKey ] ||
							wooState?.products?.[ productId ]?.[ valueKey ];

						if (
							typeof value === 'string' &&
							attribute === 'innerHTML'
						) {
							element.ref.innerHTML = sanitize( value, {
								ALLOWED_TAGS,
								ALLOWED_ATTR,
							} );
						} else if (
							( typeof value === 'number' ||
								typeof value === 'string' ) &&
							attribute
						) {
							element.ref.setAttribute(
								attribute,
								value.toString()
							);
						}
					}
				);
			},
		},
	},
	{ lock: true }
);

export type ProductElementStore = typeof productElementStore;
