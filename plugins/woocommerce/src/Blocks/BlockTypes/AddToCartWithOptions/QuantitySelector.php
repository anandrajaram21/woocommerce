<?php
declare(strict_types=1);

namespace Automattic\WooCommerce\Blocks\BlockTypes\AddToCartWithOptions;

use Automattic\WooCommerce\Blocks\BlockTypes\AbstractBlock;
use Automattic\WooCommerce\Blocks\BlockTypes\EnableBlockJsonAssetsTrait;
use Automattic\WooCommerce\Blocks\BlockTypes\AddToCartWithOptions\Utils as AddToCartWithOptionsUtils;
use Automattic\WooCommerce\Blocks\Utils\StyleAttributesUtils;

/**
 * Block type for quantity selector in add to cart with options.
 */
class QuantitySelector extends AbstractBlock {

	use EnableBlockJsonAssetsTrait;

	/**
	 * Block name.
	 *
	 * @var string
	 */
	protected $block_name = 'add-to-cart-with-options-quantity-selector';

	/**
	 * Render the block.
	 *
	 * The selector is hidden for:
	 * - Simple products that are out of stock.
	 * - Not purchasable simple products.
	 * - External products with URLs
	 * - Products sold individually
	 *
	 * @param array    $attributes Block attributes.
	 * @param string   $content Block content.
	 * @param WP_Block $block Block instance.
	 *
	 * @return string | void Rendered block output.
	 */
	protected function render( $attributes, $content, $block ) {
		global $product;
		$previous_product = $product;

		$product = AddToCartWithOptionsUtils::get_product_from_context( $block, $previous_product );

		if ( ! $product ) {
			$product = $previous_product;

			return '';
		}

		if ( AddToCartWithOptionsUtils::is_not_purchasable_product( $product ) ) {
			$product = $previous_product;

			return '';
		}

		$is_external_product_with_url        = $product instanceof \WC_Product_External && $product->get_product_url();
		$can_only_be_purchased_one_at_a_time = $product->is_sold_individually();
		$managing_stock                      = $product->managing_stock();
		$stock_quantity                      = $product->get_stock_quantity();
		$allows_backorders                   = $product->backorders_allowed();

		if ( AddToCartWithOptionsUtils::is_min_max_quantity_same( $product ) ) {
			$product = $previous_product;
			return '';
		}

		if ( $is_external_product_with_url || $can_only_be_purchased_one_at_a_time || ( $managing_stock && $stock_quantity <= 1 && ! $allows_backorders ) ) {
			$product = $previous_product;

			return '';
		}

		$is_descendant_of_grouped_product_selector = isset( $block->context['isDescendantOfGroupedProductSelector'] );
		$is_interactive                            = ! $is_descendant_of_grouped_product_selector && $product->is_type( 'variable' );

		/**
		 * Filter the minimum quantity value allowed for the product.
		 *
		 * @since 10.0.0
		 * @param int        $min_value Minimum quantity value.
		 * @param WC_Product $product   Product object.
		 */
		$min_value = apply_filters( 'woocommerce_quantity_input_min', $product->get_min_purchase_quantity(), $product );
		/**
		 * Filter the maximum quantity value allowed for the product.
		 *
		 * @since 10.0.0
		 * @param int        $max_value Maximum quantity value.
		 * @param WC_Product $product   Product object.
		 */
		$max_value = apply_filters( 'woocommerce_quantity_input_max', $product->get_max_purchase_quantity(), $product );
		/**
		 * Filter the quantity step value for the product.
		 *
		 * @since 10.2.0
		 * @param int        $step_value Quantity step value.
		 * @param WC_Product $product   Product object.
		 */
		$step_value = apply_filters( 'woocommerce_quantity_input_step', 1, $product );

		if ( $is_interactive ) {
			$variations                = $product->get_available_variations( 'objects' );
			$formatted_variations_data = array();
			foreach ( $variations as $variation ) {
				/**
				 * Filter the minimum quantity value allowed for the variation.
				 *
				 * @since 10.2.0
				 * @param int        $min_value Minimum quantity value.
				 * @param WC_Product $variation variation object.
				 */
				$variation_min_value = apply_filters( 'woocommerce_quantity_input_min', $variation->get_min_purchase_quantity(), $variation );
				/**
				 * Filter the maximum quantity value allowed for the variation.
				 *
				 * @since 10.2.0
				 * @param int        $max_value Maximum quantity value.
				 * @param WC_Product $variation variation object.
				 */
				$variation_max_value = apply_filters( 'woocommerce_quantity_input_max', $variation->get_max_purchase_quantity(), $variation );
				/**
				 * Filter the quantity step value for the variation.
				 *
				 * @since 10.2.0
				 * @param int        $step_value Quantity step value.
				 * @param WC_Product $variation variation object.
				 */
				$variation_step_value = apply_filters( 'woocommerce_quantity_input_step', 1, $variation );

				$formatted_variations_data[ $variation->get_id() ] = array(
					'min_value'  => $variation_min_value,
					'max_value'  => $variation_max_value,
					'step_value' => $variation_step_value,
				);
			}

			wp_interactivity_state(
				'woocommerce',
				array(
					'products' => array(
						$product->get_id() => array(
							'min_value'  => $min_value,
							'max_value'  => $max_value,
							'step_value' => $step_value,
							'variations' => $formatted_variations_data,
						),
					),
				)
			);
			wp_enqueue_script_module( 'woocommerce/product-elements' );
		}

		ob_start();

		woocommerce_quantity_input(
			array(
				'min_value'   => $min_value,
				'max_value'   => $max_value,
				'input_value' => isset( $_POST['quantity'] ) ? wc_stock_amount( wp_unslash( $_POST['quantity'] ) ) : $product->get_min_purchase_quantity(), // phpcs:ignore WordPress.Security.NonceVerification.Missing
			)
		);

		$product_html = ob_get_clean();

		$product_name = $product->get_name();

		$product_html = AddToCartWithOptionsUtils::add_quantity_steppers( $product_html, $product_name );
		$product_html = AddToCartWithOptionsUtils::add_quantity_stepper_classes( $product_html );

		$classes_and_styles = StyleAttributesUtils::get_classes_and_styles_by_attributes( $attributes, array(), array( 'extra_classes' ) );

		$classes = implode(
			' ',
			array_filter(
				array(
					'wp-block-add-to-cart-with-options-quantity-selector wc-block-add-to-cart-with-options__quantity-selector',
					esc_attr( $classes_and_styles['classes'] ),
				)
			)
		);

		$wrapper_attributes = get_block_wrapper_attributes(
			array(
				'class' => $classes,
				'style' => esc_attr( $classes_and_styles['styles'] ),
			)
		);

		$form = AddToCartWithOptionsUtils::make_quantity_input_interactive( $product_html, $wrapper_attributes );

		if ( $is_interactive ) {
			$processor = new \WP_HTML_Tag_Processor( $form );
			if (
				$processor->next_tag( 'input' ) &&
				$processor->get_attribute( 'type' ) === 'number' &&
				strpos( $processor->get_attribute( 'name' ), 'quantity' ) !== false
			) {
				// $processor->set_attribute( 'data-wp-interactive', 'woocommerce/product-elements' );
				// $processor->set_attribute( 'data-wp-context', '{"attributes":{"min":"min_value","max":"max_value","step":"step_value"}}' );
				// $processor->set_attribute( 'data-wp-watch', 'callbacks.updateValue' );
				$processor->set_attribute( 'data-wp-bind--value', 'wooocommerce/add-to-cart-with-options::context.lastQuantity' );
				$processor->set_attribute( 'data-wp-bind--data-valueeeeeee', 'wooocommerce/add-to-cart-with-options::context.lastQuantity' );
			}

			$form = $processor->get_updated_html();
		}
		$product = $previous_product;

		return $form;
	}
}
