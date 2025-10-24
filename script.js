// Optimized version with caching for faster loading
const GOOGLE_SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSVGapl1S-krQxuVfbywRjoNvU6CsAyRTdHLZfeeRlgogKmbfuJ-XwPe5V6sg5eY1GRD0UiFI1czYm7/pub?output=csv';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache

let products = [];
let currentProduct = null;
let categories = [];

// Initialize the website when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('PR Sport - Initializing website');
    loadProducts();
    setupEventListeners();
});

// Load products from Google Sheets WITH CACHING
async function loadProducts() {
    const loadingElement = document.getElementById('products-container');
    
    try {
        // Show loading state
        loadingElement.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Loading products...</p>
                <small>First load may take a few seconds</small>
            </div>
        `;

        // Check if we have cached data
        const cached = localStorage.getItem('prsport-products-cache');
        const cacheTime = localStorage.getItem('prsport-products-cache-time');
        
        // If cache exists and is fresh, use it IMMEDIATELY
        if (cached && cacheTime && (Date.now() - parseInt(cacheTime)) < CACHE_DURATION) {
            console.log('Using cached products - instant load!');
            const cachedData = JSON.parse(cached);
            products = cachedData.products;
            categories = cachedData.categories;
            displayCategories();
            displayProducts();
            
            // Still load fresh data in background for next time
            setTimeout(loadFreshProducts, 100);
            return;
        }

        // No cache or cache expired - load fresh data
        await loadFreshProducts();
        
    } catch (error) {
        console.error('Error loading products:', error);
        
        loadingElement.innerHTML = `
            <div class="loading">
                <p style="color: #e74c3c;">Loading slowly... Showing cached version</p>
                <button onclick="retryLoad()" class="order-btn" style="margin-top: 10px; background: #1e3c72;">
                    Retry Loading
                </button>
            </div>
        `;
        
        // Try cached version even if expired
        const cached = localStorage.getItem('prsport-products-cache');
        if (cached) {
            console.log('Using expired cache as fallback');
            const cachedData = JSON.parse(cached);
            products = cachedData.products;
            categories = cachedData.categories;
            displayCategories();
            displayProducts();
        } else {
            useSampleProducts();
        }
    }
}

// Load fresh products from Google Sheets
async function loadFreshProducts() {
    console.log('Loading fresh products from Google Sheets...');
    
    try {
        // Set a timeout for the fetch (15 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(GOOGLE_SHEETS_URL, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error('Failed to load Google Sheets');
        }
        
        const csvData = await response.text();
        products = parseGoogleSheetsData(csvData);
        
        if (products.length === 0) {
            throw new Error('No products found in Google Sheets');
        }
        
        // Extract unique categories
        categories = [...new Set(products.map(product => product.category))].filter(Boolean);
        
        // Save to cache for NEXT time
        const cacheData = {
            products: products,
            categories: categories,
            timestamp: new Date().toLocaleString()
        };
        localStorage.setItem('prsport-products-cache', JSON.stringify(cacheData));
        localStorage.setItem('prsport-products-cache-time', Date.now().toString());
        
        console.log(`Loaded ${products.length} products, ${categories.length} categories`);
        
        displayCategories();
        displayProducts();
        
    } catch (error) {
        console.error('Error loading fresh products:', error);
        throw error; // Re-throw to be handled by main function
    }
}

// Retry loading function
function retryLoad() {
    console.log('Retrying load...');
    // Clear cache and retry
    localStorage.removeItem('prsport-products-cache');
    localStorage.removeItem('prsport-products-cache-time');
    loadProducts();
}

// Parse Google Sheets data (keep your existing function)
function parseGoogleSheetsData(csv) {
    const lines = csv.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length < 2) {
        return [];
    }
    
    const products = [];
    const headers = lines[0].split(',').map(header => header.trim());
    
    console.log('Headers found:', headers);
    
    // Process each row starting from row 1 (after headers)
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCSVLine(line);
        
        if (values.length >= headers.length) {
            const product = {};
            
            // Map values to headers
            headers.forEach((header, index) => {
                product[header] = values[index] || '';
            });
            
            // Process the product data
            const processedProduct = processProductData(product);
            if (processedProduct) {
                products.push(processedProduct);
            }
        }
    }
    
    return products;
}

// Parse CSV line properly (handles commas within fields)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current);
    return result.map(field => field.replace(/^"|"$/g, '').trim());
}

// Process product data from Google Sheets
function processProductData(product) {
    if (!product.name || !product.name.trim()) {
        return null;
    }
    
    // Process price - remove $ sign if present
    let price = product.price || '0';
    price = price.replace('$', '').trim();
    
    // Process discount - remove $ sign if present
    let discount = product.Discount || '0';
    discount = discount.replace('$', '').trim();
    
    // Calculate final price
    let finalPrice = parseFloat(price) - parseFloat(discount);
    if (isNaN(finalPrice)) {
        finalPrice = parseFloat(price);
    }
    
    // Process sizes - convert to array format
    let availableSizes = [];
    if (product.sizes && product.sizes.trim()) {
        const sizeArray = product.sizes.split(',').map(size => size.trim());
        availableSizes = sizeArray.map(size => ({
            size: size,
            quantity: 10 // Default quantity
        }));
    } else {
        availableSizes = [{ size: 'One Size', quantity: 10 }];
    }
    
    // Process image URLs
    let imageUrls = [];
    if (product.imageUrls && product.imageUrls.trim()) {
        let imageUrl = product.imageUrls.trim();
        imageUrls = [imageUrl];
    } else {
        // Use default soccer-related images
        imageUrls = [
            'https://images.unsplash.com/photo-1574629810360-7efbbe195018?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80',
            'https://images.unsplash.com/photo-1579758682664-5b1e5a5e3d2f?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80',
            'https://images.unsplash.com/photo-1600674845588-70ceb83b8ecf?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80'
        ];
    }
    
    return {
        id: product.id || `product-${Date.now()}-${Math.random()}`,
        name: product.name,
        category: product.Category || 'Uncategorized',
        description: product.description || 'High quality soccer product',
        price: price,
        discount: discount,
        finalPrice: finalPrice,
        availableSizes: availableSizes,
        imageUrls: imageUrls
    };
}

// Use sample products if Google Sheets fails
function useSampleProducts() {
    console.log('Using sample products');
    const loadingElement = document.getElementById('products-container');
    
    products = [
        {
            id: '1',
            name: 'Barcelona Jersey 2024',
            category: 'Grade A Player Version',
            description: 'Official Barcelona FC home jersey for the 2024 season',
            price: '12',
            discount: '4',
            finalPrice: 8,
            availableSizes: [
                { size: 'S', quantity: 5 },
                { size: 'M', quantity: 8 },
                { size: 'L', quantity: 3 }
            ],
            imageUrls: ['https://images.unsplash.com/photo-1600674845588-70ceb83b8ecf?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80']
        },
        {
            id: '2',
            name: 'Professional Soccer Cleats',
            category: 'Cleats',
            description: 'High-performance soccer cleats with advanced grip technology',
            price: '129.99',
            discount: '30',
            finalPrice: 99.99,
            availableSizes: [
                { size: 'US 8', quantity: 4 },
                { size: 'US 9', quantity: 6 },
                { size: 'US 10', quantity: 3 }
            ],
            imageUrls: ['https://images.unsplash.com/photo-1579758682664-5b1e5a5e3d2f?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80']
        }
    ];
    
    // Extract unique categories
    categories = [...new Set(products.map(product => product.category))].filter(Boolean);
    displayCategories();
    displayProducts();
    
    loadingElement.innerHTML = `<div class="loading"><p>Using sample products - real products failed to load</p></div>`;
    setTimeout(displayProducts, 500);
}

// Display categories in dropdown and filter buttons
function displayCategories() {
    // Populate dropdown menu
    const dropdown = document.getElementById('categoryDropdown');
    dropdown.innerHTML = `
        <a href="#products" data-category="all">All Products</a>
        ${categories.map(category => `
            <a href="#products" data-category="${category}">${category}</a>
        `).join('')}
    `;
    
    // Populate category filter buttons
    const categoryFilter = document.getElementById('categoryFilter');
    categoryFilter.innerHTML = `
        <button class="category-btn active" data-category="all">All Products</button>
        ${categories.map(category => `
            <button class="category-btn" data-category="${category}">${category}</button>
        `).join('')}
    `;
}

// Display products on the page
function displayProducts(filterCategory = 'all') {
    const container = document.getElementById('products-container');
    
    // Filter products if needed
    const filteredProducts = filterCategory === 'all' 
        ? products 
        : products.filter(product => product.category === filterCategory);
    
    if (filteredProducts.length === 0) {
        container.innerHTML = `
            <div class="loading">
                <p>No products found in this category.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredProducts.map(product => {
        // Check if product has a discount
        const hasDiscount = product.discount && parseFloat(product.discount) > 0;
        
        return `
        <div class="product-card" data-product-id="${product.id}" data-category="${product.category}">
            <div class="product-image-container">
                <img src="${product.imageUrls[0]}" 
                     alt="${product.name}" 
                     class="product-image"
                     onerror="handleImageError(this, '${product.name}')">
            </div>
            
            <div class="product-content">
                <div class="product-category">${product.category}</div>
                <h3 class="product-title">${product.name}</h3>
                <p class="product-description">${product.description}</p>
                
                <div class="product-price-container">
                    ${hasDiscount ? `
                        <span class="original-price">$${product.price}</span>
                        <span class="discounted-price">$${product.finalPrice}</span>
                        <span class="discount-badge">Save $${product.discount}</span>
                    ` : `
                        <span class="discounted-price">$${product.price}</span>
                    `}
                </div>
                
                <div class="size-selector">
                    <label>Available Sizes:</label>
                    <div class="size-options">
                        ${product.availableSizes.map(sizeInfo => `
                            <div class="size-option ${sizeInfo.quantity === 0 ? 'out-of-stock' : ''}"
                                 data-size="${sizeInfo.size}"
                                 data-quantity="${sizeInfo.quantity}">
                                ${sizeInfo.size} ${sizeInfo.quantity === 0 ? '(Out of Stock)' : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <button class="order-btn" data-product-id="${product.id}" disabled>
                    Order Now
                </button>
            </div>
        </div>
        `;
    }).join('');
    
    console.log(`Displayed ${filteredProducts.length} products`);
}

// Handle image loading errors
function handleImageError(img, productName) {
    console.log(`Image failed to load for: ${productName}`);
    // Use a random soccer-related fallback image
    const fallbackImages = [
        'https://images.unsplash.com/photo-1574629810360-7efbbe195018?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1579758682664-5b1e5a5e3d2f?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1600674845588-70ceb83b8ecf?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1614632537197-38a17061c2bd?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1599058917765-660d3e6cb67f?ixlib=rb-1.2.1&auto=format&fit=crop&w=600&q=80'
    ];
    const randomImage = fallbackImages[Math.floor(Math.random() * fallbackImages.length)];
    img.src = randomImage;
}

// Setup all event listeners
function setupEventListeners() {
    // Handle size selection
    document.getElementById('products-container').addEventListener('click', function(e) {
        if (e.target.classList.contains('size-option') && !e.target.classList.contains('out-of-stock')) {
            const productCard = e.target.closest('.product-card');
            const productId = productCard.dataset.productId;
            const size = e.target.dataset.size;
            
            // Remove selected class from all sizes in this card
            productCard.querySelectorAll('.size-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Add selected class to clicked size
            e.target.classList.add('selected');
            
            // Enable order button
            const orderBtn = productCard.querySelector('.order-btn');
            orderBtn.disabled = false;
            orderBtn.onclick = () => openOrderModal(productId);
        }
        
        // Handle order button click
        if (e.target.classList.contains('order-btn') && !e.target.disabled) {
            const productId = e.target.dataset.productId;
            openOrderModal(productId);
        }
    });

    // Handle category filter buttons
    document.getElementById('categoryFilter').addEventListener('click', function(e) {
        if (e.target.classList.contains('category-btn')) {
            const category = e.target.dataset.category;
            
            // Update active button
            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            e.target.classList.add('active');
            
            // Filter products
            displayProducts(category);
        }
    });

    // Handle category dropdown
    document.getElementById('categoryDropdown').addEventListener('click', function(e) {
        if (e.target.tagName === 'A') {
            const category = e.target.dataset.category;
            
            // Update active filter button
            document.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.category === category) {
                    btn.classList.add('active');
                }
            });
            
            // Filter products
            displayProducts(category);
            
            // Scroll to products section
            document.getElementById('products').scrollIntoView({
                behavior: 'smooth'
            });
        }
    });

    // Handle form submission
    document.getElementById('orderForm').addEventListener('submit', function(e) {
        e.preventDefault();
        submitOrder();
    });

    // Handle modal close
    document.getElementById('cancelOrder').addEventListener('click', closeModal);
    document.getElementById('orderModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });

    // Handle Telegram checkbox
    document.getElementById('hasTelegram').addEventListener('change', function() {
        const telegramInfo = document.getElementById('telegramInfo');
        telegramInfo.style.display = this.checked ? 'block' : 'none';
    });

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            // Skip if it's a category dropdown link
            if (this.dataset.category) return;
            
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Open order modal
function openOrderModal(productId) {
    currentProduct = products.find(p => p.id === productId);
    if (!currentProduct) {
        alert('Product not found!');
        return;
    }
    
    const productCard = document.querySelector(`[data-product-id="${productId}"]`);
    const selectedSize = productCard.querySelector('.size-option.selected')?.dataset.size;
    
    document.getElementById('selectedProduct').value = currentProduct.name;
    document.getElementById('selectedSize').value = selectedSize || 'One Size';
    
    // Use the final price (after discount) for the order
    const finalPrice = currentProduct.finalPrice || currentProduct.price;
    document.getElementById('selectedPrice').value = finalPrice;
    
    document.getElementById('orderModal').style.display = 'flex';
}

// Close modal
function closeModal() {
    document.getElementById('orderModal').style.display = 'none';
    document.getElementById('orderForm').reset();
    document.getElementById('telegramInfo').style.display = 'none';
}

// Submit order with better error handling and correct time
async function submitOrder() {
    const formData = {
        product: document.getElementById('selectedProduct').value,
        size: document.getElementById('selectedSize').value,
        price: document.getElementById('selectedPrice').value,
        name: document.getElementById('customerName').value,
        phone: document.getElementById('customerPhone').value,
        hasTelegram: document.getElementById('hasTelegram').checked,
        address: document.getElementById('customerAddress').value,
        quantity: document.getElementById('orderQuantity').value,
        notes: document.getElementById('orderNotes').value,
        // Add local time from user's device
        localTime: new Date().toLocaleString('en-US', {
            timeZone: 'Asia/Phnom_Penh', // Cambodia timezone
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false // 24-hour format
        })
    };

    // Validate form
    if (!formData.name || !formData.phone || !formData.address || !formData.hasTelegram) {
        alert('Please fill in all required fields and confirm you have Telegram.');
        return;
    }

    try {
        // Show loading state
        const submitBtn = document.querySelector('#orderForm .btn-primary');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;

        console.log('Sending order to function...');

        // Send to Netlify function
        const response = await fetch('/.netlify/functions/send-order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        console.log('Response status:', response.status);

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text);
            throw new Error('Server returned invalid response. Please check function deployment.');
        }

        const result = await response.json();
        console.log('Response data:', result);

        if (response.ok) {
            alert('✅ Order placed successfully! We will contact you on Telegram soon.');
            closeModal();
        } else {
            throw new Error(result.error || result.details || 'Failed to process order');
        }
    } catch (error) {
        console.error('Order submission error:', error);
        
        if (error.message.includes('JSON') || error.message.includes('function')) {
            alert('❌ Function not deployed correctly. Please check Netlify functions.');
        } else {
            alert('❌ Error: ' + error.message);
        }
    } finally {
        // Reset button
        const submitBtn = document.querySelector('#orderForm .btn-primary');
        if (submitBtn) {
            submitBtn.textContent = 'Place Order';
            submitBtn.disabled = false;
        }
    }
}