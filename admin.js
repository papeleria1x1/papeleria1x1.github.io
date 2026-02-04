// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyC2phZiWGmGNqfo5XxlBg53oGxUNK6ttgo",
    authDomain: "papeleria-1x1-y-mas.firebaseapp.com",
    databaseURL: "https://papeleria-1x1-y-mas-default-rtdb.firebaseio.com",
    projectId: "papeleria-1x1-y-mas",
    storageBucket: "papeleria-1x1-y-mas.firebasestorage.app",
    messagingSenderId: "606203364469",
    appId: "1:606203364469:web:96d0c545282cc75251e43c",
    measurementId: "G-C7DCRY1JSB"
};

// Global services
let db, rtdb, storage;

// Global State
let currentEditingProductId = null;
let productImages = [];

// Initialize Firebase
function initializeFirebase() {
    if (typeof firebase === 'undefined') {
        console.error('Firebase SDK not loaded');
        return;
    }

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    db = firebase.firestore();
    rtdb = firebase.database();

    // Configurar persistencia si es posible
    db.enablePersistence().catch(err => console.log('Persistencia no disponible:', err.code));

    console.log('Firebase Initialized');

    // Start app
    initializeApp();
}

// Main App Initialization
function initializeApp() {
    setupNavigation();
    loadProducts();
    loadStats();
    setupOrderFilters();
    checkUrlParams();
}

// Navigation
function setupNavigation() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
            const wrapper = document.getElementById('adminWrapper');
            if (wrapper) wrapper.classList.remove('menu-open');
        });
    });

    const toggleBtn = document.querySelector('.mobile-menu-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            document.getElementById('adminWrapper').classList.toggle('menu-open');
        });
    }

    const addProductBtn = document.getElementById('addProductBtn');
    if (addProductBtn) addProductBtn.addEventListener('click', showProductForm);

    const cancelProductBtn = document.getElementById('cancelProductBtn');
    if (cancelProductBtn) cancelProductBtn.addEventListener('click', () => {
        hideProductForm();
        resetProductForm();
    });

    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveProduct();
        });
    }

    const addUrlImageBtn = document.getElementById('addUrlImage');
    if (addUrlImageBtn) {
        addUrlImageBtn.addEventListener('click', () => {
            const urlInput = document.getElementById('imageUrl');
            if (urlInput && urlInput.value.trim()) {
                addImageToPreview(urlInput.value.trim());
                urlInput.value = '';
            }
        });
    }

    // File upload area for products (Cloudinary)
    const fileUploadArea = document.getElementById('fileUploadArea');
    if (fileUploadArea) {
        fileUploadArea.addEventListener('click', (e) => {
            e.preventDefault();
            handleAddProductFile();
        });
    }

    // Prevent default on file input if somehow triggered
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('click', (e) => {
            e.preventDefault();
        });
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) btn.classList.add('active');
    });

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const activeTab = document.getElementById(`${tabName}-tab`);
    if (activeTab) activeTab.classList.add('active');

    if (tabName === 'products') loadProducts();
    if (tabName === 'orders') loadOrders();
    if (tabName === 'users') loadUsers();
    if (tabName === 'carousel') loadCarouselImages();
    if (tabName === 'promotions') loadPromotions();
}

function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    if (tab) switchTab(tab);
}

// Stats & Other basics (placeholder functions)
async function loadStats() {
    try {
        const ordersSnapshot = await rtdb.ref('orders').once('value');
        const usersSnapshot = await rtdb.ref('users').once('value');

        const orders = ordersSnapshot.val() || {};
        const users = usersSnapshot.val() || {};

        const totalOrders = Object.keys(orders).length;
        const totalUsers = Object.keys(users).length;

        let totalRevenue = 0;
        Object.values(orders).forEach(order => {
            const status = order.status || 'pending';
            const method = order.paymentMethod || 'whatsapp';
            let shouldCount = false;

            if (method === 'card') {
                // Card: Paid is enough (or delivered/completed)
                if (['paid', 'delivered', 'completed'].includes(status)) {
                    shouldCount = true;
                }
            } else {
                // Cash (others): ONLY when delivered (or completed)
                if (['delivered', 'completed'].includes(status)) {
                    shouldCount = true;
                }
            }

            if (shouldCount) {
                totalRevenue += (order.total || 0);
            }
        });

        // Update UI
        const totalOrdersEl = document.getElementById('totalOrders');
        const totalRevenueEl = document.getElementById('totalRevenue');
        const totalUsersEl = document.getElementById('totalUsers');

        if (totalOrdersEl) totalOrdersEl.innerText = totalOrders;
        if (totalRevenueEl) totalRevenueEl.innerText = `$${totalRevenue.toFixed(2)}`;
        if (totalUsersEl) totalUsersEl.innerText = totalUsers;

    } catch (error) {
        console.error("Error loading stats:", error);
    }
}
function setupOrderFilters() { return; }
// ============================================
// USERS & ORDERS MANAGEMENT
// ============================================

async function loadOrders() {
    const container = document.getElementById('ordersList');
    if (!container) return;
    container.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';

    try {
        const snapshot = await rtdb.ref('orders').orderByChild('timestamp').limitToLast(100).once('value');
        const ordersData = snapshot.val();

        if (!ordersData) {
            container.innerHTML = '<div class="alert alert-info">No hay pedidos registrados.</div>';
            return;
        }

        const orders = Object.entries(ordersData).map(([key, value]) => ({
            id: key,
            ...value
        })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        // Group by Client
        const clients = {};
        orders.forEach(order => {
            const email = order.userInfo?.email || order.shippingAddress?.email || order.userId || 'invitado@anonym.com';
            const name = order.userInfo?.fullName || order.shippingAddress?.fullName || 'Invitado';

            if (!clients[email]) {
                clients[email] = {
                    name: name,
                    email: email,
                    orders: [],
                    totalSpent: 0
                };
            }
            clients[email].orders.push(order);
            clients[email].totalSpent += (order.total || 0);
        });

        // Generate Accordion HTML
        let html = '<div class="accordion" id="ordersAccordion">';

        let index = 0;
        for (const [email, client] of Object.entries(clients)) {
            index++;
            const safeId = `client-${index}`;
            const totalSpentFormatted = client.totalSpent.toFixed(2);

            // Generate Orders Table for this client
            let ordersHtml = `
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="bg-light">
                            <tr>
                                <th>ID</th>
                                <th>Total</th>
                                <th>Estado</th>
                                <th>Fecha</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            client.orders.forEach(order => {
                const date = order.timestamp ? new Date(order.timestamp).toLocaleDateString() : 'N/A';

                let statusClass = 'secondary';
                if (order.status === 'completed' || order.status === 'paid' || order.status === 'delivered') statusClass = 'success';
                else if (order.status === 'pending') statusClass = 'warning';
                else if (order.status === 'cancelled') statusClass = 'danger';

                // Get customer phone from userInfo
                const customerPhone = order.userInfo?.phone || order.shippingAddress?.phone || '';
                const customerName = order.userInfo?.fullName || order.shippingAddress?.fullName || 'Cliente';
                const orderId = order.id.slice(-6);

                // Create detailed WhatsApp message with order info
                let orderDetails = `Hola ${customerName}, te contacto de Papelería 1x1 y Más respecto a tu pedido #${orderId}.\n\n`;
                orderDetails += `📦 *Detalles del Pedido:*\n`;
                orderDetails += `━━━━━━━━━━━━━━━━\n`;

                // Add products
                if (order.items && order.items.length > 0) {
                    order.items.forEach((item, index) => {
                        orderDetails += `${index + 1}. ${item.name}\n`;
                        orderDetails += `   Cantidad: ${item.quantity}\n`;
                        orderDetails += `   Precio: $${(item.totalPrice || 0).toFixed(2)}\n`;
                    });
                }

                orderDetails += `━━━━━━━━━━━━━━━━\n`;
                orderDetails += `💰 *Total: $${(order.total || 0).toFixed(2)}*\n`;
                orderDetails += `📍 Método: ${order.deliveryMethod === 'delivery' ? 'Envío a Domicilio' : 'Recoger en Tienda'}\n`;
                orderDetails += `📅 Fecha: ${date}\n`;
                orderDetails += `📊 Estado: ${order.status || 'pending'}\n\n`;
                orderDetails += `¿En qué puedo ayudarte?`;

                const whatsappLink = customerPhone ?
                    `https://wa.me/52${customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(orderDetails)}` :
                    '';

                ordersHtml += `
                    <tr>
                        <td data-label="ID"><small class="text-muted fw-bold">#${orderId}</small></td>
                        <td data-label="Total" class="fw-bold">$${(order.total || 0).toFixed(2)}</td>
                        <td data-label="Estado"><span class="badge rounded-pill bg-${statusClass}">${order.status || 'pending'}</span></td>
                        <td data-label="Fecha">${date}</td>
                        <td data-label="Acciones">
                            <div class="d-flex gap-2">
                                <button class="btn btn-sm btn-primary" onclick="viewOrder('${order.id}')">
                                    <i class="fas fa-eye"></i> Ver
                                </button>
                                ${customerPhone ? `
                                    <a href="${whatsappLink}" target="_blank" class="btn btn-sm btn-success" title="Contactar por WhatsApp">
                                        <i class="fab fa-whatsapp"></i>
                                    </a>
                                ` : `
                                    <button class="btn btn-sm btn-warning" title="Sin teléfono registrado" disabled>
                                        <i class="fas fa-exclamation-triangle"></i>
                                    </button>
                                `}
                            </div>
                        </td>
                    </tr>
                `;
            });

            ordersHtml += '</tbody></table></div>';

            // Accordion Item
            html += `
                <div class="accordion-item mb-3 border-0 shadow-sm rounded-3 overflow-hidden" style="background: white;">
                    <h2 class="accordion-header" id="heading-${safeId}">
                        <button class="accordion-button collapsed bg-white p-3" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${safeId}">
                             <div class="d-flex align-items-center gap-3 w-100 pe-2">
                                 <div class="rounded-circle p-2 d-flex align-items-center justify-content-center" style="width:45px;height:45px; background: var(--primary-light); color: var(--primary);">
                                    <i class="fas fa-user"></i>
                                 </div>
                                 <div class="d-flex flex-column text-start">
                                    <span class="fw-bold text-dark fs-6">${client.name}</span>
                                    <small class="text-muted" style="font-size: 13px;">${client.orders.length} Pedido(s)</small>
                                 </div>
                                 <div class="ms-auto fw-bold text-dark fs-5">$${totalSpentFormatted}</div>
                             </div>
                        </button>
                    </h2>
                    <div id="collapse-${safeId}" class="accordion-collapse collapse" data-bs-parent="#ordersAccordion">
                        <div class="accordion-body p-0 border-top">
                             ${ordersHtml}
                        </div>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading orders:', error);
        container.innerHTML = '<div class="alert alert-danger">Error al cargar pedidos: ' + error.message + '</div>';
    }
}

async function loadUsers() {
    const container = document.getElementById('usersList');
    if (!container) return;
    container.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';

    try {
        const snapshot = await rtdb.ref('users').limitToLast(100).once('value');
        const usersData = snapshot.val();

        if (!usersData) {
            container.innerHTML = '<div class="alert alert-info">No hay usuarios registrados en la base de datos.</div>';
            return;
        }

        const users = Object.values(usersData).sort((a, b) => {
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });

        let html = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Usuario</th>
                            <th>Email</th>
                            <th>Rol</th>
                            <th>Registrado</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        users.forEach(user => {
            const date = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
            const role = user.role || 'customer';

            html += `
                <tr>
                    <td data-label="Usuario">
                        <div class="d-flex align-items-center gap-2 user-info-wrapper">
                            <div class="bg-light rounded-circle p-2 d-flex align-items-center justify-content-center" style="width:35px;height:35px">
                                <i class="fas fa-user text-secondary"></i>
                            </div>
                            <div class="d-flex flex-column">
                                <span class="fw-bold text-dark">${user.fullName || user.username || 'Usuario'}</span>
                                <small class="text-muted d-lg-none">${user.email}</small>
                            </div>
                        </div>
                    </td>
                    <td data-label="Email" class="d-none d-lg-table-cell text-muted">${user.email || 'N/A'}</td>
                    <td data-label="Rol"><span class="badge rounded-pill bg-${role === 'admin' ? 'primary' : 'secondary'} px-3">${role}</span></td>
                    <td data-label="Registrado" class="text-end text-lg-start">${date}</td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading users:', error);
        container.innerHTML = '<div class="alert alert-danger">Error al cargar usuarios.</div>';
    }
}

// Order View & Status Management
window.viewOrder = (id) => {
    // Show spinner in modal while loading
    const modal = document.getElementById('ticketModal');
    const content = document.getElementById('ticketContent');
    if (modal) modal.style.display = 'flex';
    content.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary"></div></div>';

    rtdb.ref(`orders/${id}`).once('value').then(snap => {
        const data = snap.val();
        if (!data) {
            content.innerHTML = '<div class="alert alert-danger">Pedido no encontrado</div>';
            return;
        }

        const itemsHtml = (data.items || []).map(i => `
            <div class="d-flex justify-content-between mb-2 pb-2 border-bottom">
                <span>${i.name} <small class="text-muted">x${i.quantity}</small></span>
                <span class="fw-bold">$${(i.totalPrice || 0).toFixed(2)}</span>
            </div>
        `).join('');

        const currentStatus = data.status || 'pending';

        // Get customer contact info
        const customerPhone = data.userInfo?.phone || data.shippingAddress?.phone || '';
        const customerName = data.userInfo?.fullName || 'Cliente';
        const orderId = id.slice(-6);
        const date = data.timestamp ? new Date(data.timestamp).toLocaleDateString() : 'N/A';

        // Create detailed WhatsApp message with order info
        let orderDetails = `Hola ${customerName}, te contacto de Papelería 1x1 y Más respecto a tu pedido #${orderId}.\n\n`;
        orderDetails += `📦 *Detalles del Pedido:*\n`;
        orderDetails += `━━━━━━━━━━━━━━━━\n`;

        // Add products
        if (data.items && data.items.length > 0) {
            data.items.forEach((item, index) => {
                orderDetails += `${index + 1}. ${item.name}\n`;
                orderDetails += `   Cantidad: ${item.quantity}\n`;
                orderDetails += `   Precio: $${(item.totalPrice || 0).toFixed(2)}\n`;
            });
        }

        orderDetails += `━━━━━━━━━━━━━━━━\n`;
        orderDetails += `💰 *Total: $${(data.total || 0).toFixed(2)}*\n`;
        // Determine delivery label
        let deliveryLabel = data.deliveryMethod === 'delivery' ? 'Envío a Domicilio' : 'Recoger en Tienda';
        if (data.deliveryMethod === 'delivery' && data.shippingOption?.name) {
            deliveryLabel += ` (${data.shippingOption.name})`;
        }

        orderDetails += `📍 Método: ${deliveryLabel}\n`;
        orderDetails += `📅 Fecha: ${date}\n`;
        orderDetails += `📊 Estado: ${data.status || 'pending'}\n\n`;
        orderDetails += `¿En qué puedo ayudarte?`;

        const whatsappLink = customerPhone ?
            `https://wa.me/52${customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(orderDetails)}` :
            '';

        content.innerHTML = `
            <h3>Detalles del Pedido <small class="text-muted fs-6">#${orderId}</small></h3>
            <div class="mb-4">
                <p class="mb-1"><strong>Cliente:</strong> ${data.userInfo?.fullName || 'N/A'}</p>
                <p class="mb-1"><strong>Email:</strong> ${data.userInfo?.email || 'N/A'}</p>
                <p class="mb-1">
                    <strong>Teléfono:</strong> 
                    ${customerPhone
                ? customerPhone
                : '<span class="text-danger fw-bold">⚠️ No registrado</span>'}
                </p>
                <p class="mb-1"><strong>Método:</strong> ${deliveryLabel}</p>
                ${customerPhone ? `
                    <a href="${whatsappLink}" target="_blank" class="btn btn-success btn-sm mt-2">
                        <i class="fab fa-whatsapp"></i> Contactar por WhatsApp
                    </a>
                ` : `
                    <div class="alert alert-warning mt-2 py-2 px-3" style="font-size: 13px;">
                        <i class="fas fa-exclamation-triangle"></i> 
                        <strong>Sin teléfono:</strong> Este cliente se registró sin teléfono. 
                        Contacta por email: <a href="mailto:${data.userInfo?.email || ''}">${data.userInfo?.email || 'N/A'}</a>
                    </div>
                `}
            </div>

            <div class="mb-4 p-3 bg-white rounded border">
                <h5 class="mb-3">Productos</h5>
                ${itemsHtml}
                <div class="d-flex justify-content-between mt-2 pt-2">
                    <span class="fw-bold">Total</span>
                    <span class="fw-bold text-primary fs-5">$${(data.total || 0).toFixed(2)}</span>
                </div>
            </div>

            <div class="mb-3">
                <label class="form-label fw-bold">Actualizar Estado</label>
                <select id="statusSelect-${id}" class="form-select mb-2" onchange="updateOrderStatus('${id}', this.value)">
                    <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>Pendiente</option>
                    <option value="paid" ${currentStatus === 'paid' ? 'selected' : ''}>Pagado (Efectivo/Manual)</option>
                    <option value="delivered" ${currentStatus === 'delivered' ? 'selected' : ''}>Entregado / Enviado</option>
                    <option value="completed" ${currentStatus === 'completed' ? 'selected' : ''}>Completado</option>
                    <option value="cancelled" ${currentStatus === 'cancelled' ? 'selected' : ''}>Cancelado</option>
                </select>
                <small class="text-muted">
                    <i class="fas fa-info-circle"></i> 
                    Selecciona "Pagado" para confirmar pagos manuales. "Entregado" cuando el producto sale. "Completado" al finalizar todo.
                </small>
            </div>
        `;
    });
};

window.updateOrderStatus = (orderId, newStatus) => {
    if (!confirm(`¿Estás seguro de cambiar el estado a "${newStatus}"?`)) {
        // Technically should revert select, but reload handles it
        return;
    }

    rtdb.ref(`orders/${orderId}`).update({
        status: newStatus,
        lastUpdated: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        alert('Estado actualizado correctamente');
        loadOrders(); // Refresh table
        loadStats();  // Refresh stats
    }).catch(err => {
        console.error(err);
        alert('Error al actualizar estado');
    });
};

function closeTicketModal() {
    const modal = document.getElementById('ticketModal');
    if (modal) modal.style.display = 'none';
}


// ============================================
// PRODUCTS MANAGEMENT
// ============================================

async function loadProducts() {
    const container = document.getElementById('productsList');
    if (!container) return;

    container.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary" role="status"></div></div>';

    try {
        const snapshot = await db.collection('products').orderBy('category').get();
        const products = {};

        snapshot.forEach(doc => {
            const product = { id: doc.id, ...doc.data() };
            // Ensure numeric values
            product.price = parseFloat(product.price) || 0;
            product.wholesalePrice = parseFloat(product.wholesalePrice) || 0;
            product.stock = parseInt(product.stock) || 0;

            if (!products[product.category]) {
                products[product.category] = [];
            }
            products[product.category].push(product);
        });

        displayProducts(products);
    } catch (error) {
        console.error('Error al cargar productos:', error);
        container.innerHTML = '<div class="alert alert-danger">Error al cargar productos. Por favor recarga la página.</div>';
    }
}

function displayProducts(productsByCategory) {
    const container = document.getElementById('productsList');
    container.innerHTML = '';

    if (Object.keys(productsByCategory).length === 0) {
        container.innerHTML = '<div class="alert alert-info">No hay productos registrados.</div>';
        return;
    }

    Object.keys(productsByCategory).sort().forEach(category => {
        const categoryGroup = document.createElement('div');
        categoryGroup.className = 'category-group mb-4';

        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerHTML = `
            <h3>${category} <span style="font-size: 13px; color: var(--secondary); font-weight: 500;">(${productsByCategory[category].length})</span></h3>
            <i class="fas fa-chevron-down"></i>
        `;

        const content = document.createElement('div');
        content.className = 'category-content';
        content.style.display = 'none'; // Closed by default

        header.onclick = () => {
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'grid' : 'none';
            header.querySelector('i').style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        };

        productsByCategory[category].forEach(product => {
            const card = createProductCard(product);
            content.appendChild(card);
        });

        categoryGroup.appendChild(header);
        categoryGroup.appendChild(content);
        container.appendChild(categoryGroup);
    });
}

function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';

    const image = (product.images && product.images.length > 0) ? product.images[0] : 'https://placehold.co/150x150?text=No+Image';

    card.innerHTML = `
        <div style="height: 120px; width: 100%; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; overflow: hidden; border-radius: 8px;">
<img src="${image}" alt="${product.name}" style="max-height: 100%; max-width: 100%; object-fit: contain;" onerror="this.onerror=null; this.src='https://placehold.co/150x150?text=No+Image';">
        </div>
        <div class="product-card-info">
            <h4 style="font-size: 16px; margin-bottom: 5px; font-weight: 600;">${product.name}</h4>
            <div style="display: flex; gap: 12px; margin-bottom: 8px; font-size: 14px; color: var(--slate-700);">
                <p><i class="fas fa-tag"></i> $${product.price.toFixed(2)}</p>
                <p><i class="fas fa-boxes"></i> ${product.stock}</p>
            </div>
            <p style="font-size: 11px; opacity: 0.8; margin-bottom: 10px;">Brand: ${product.brand || 'N/A'}</p>
        </div>
        <div class="product-card-actions" style="display: flex; gap: 8px;">
            <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="editProduct('${product.id}')">
                <i class="fas fa-pen"></i> Editar
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteProduct('${product.id}')">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;

    return card;
}

// Product Form Functions
function showProductForm() {
    document.getElementById('productFormContainer').style.display = 'block';
    document.getElementById('addProductBtn').style.display = 'none';
    document.getElementById('productFormContainer').scrollIntoView({ behavior: 'smooth' });
}

function hideProductForm() {
    document.getElementById('productFormContainer').style.display = 'none';
    document.getElementById('addProductBtn').style.display = 'inline-flex';
}

function resetProductForm() {
    document.getElementById('productForm').reset();
    productImages = [];
    currentEditingProductId = null;
    updateImagePreview();
    document.getElementById('saveProductBtn').innerHTML = 'Publicar Producto';
}

function addImageToPreview(url) {
    productImages.push(url);
    updateImagePreview();
}

function updateImagePreview() {
    const container = document.getElementById('imagePreviewContainer');
    container.innerHTML = '';

    productImages.forEach((url, index) => {
        const div = document.createElement('div');
        div.className = 'image-preview-item';
        div.innerHTML = `
            <img src="${url}" alt="Preview">
            <div class="image-actions">
                <button type="button" onclick="removeProductImage(${index})"><i class="fas fa-times"></i></button>
            </div>
        `;
        container.appendChild(div);
    });
}

function removeProductImage(index) {
    productImages.splice(index, 1);
    updateImagePreview();
}

async function saveProduct() {
    const btn = document.getElementById('saveProductBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        const productData = {
            name: document.getElementById('productName').value.trim(),
            category: document.getElementById('productCategory').value.trim(),
            description: document.getElementById('productDescription').value.trim(),
            price: parseFloat(document.getElementById('productPrice').value),
            wholesalePrice: parseFloat(document.getElementById('productWholesalePrice').value),
            wholesaleQuantity: parseInt(document.getElementById('productWholesaleQuantity').value) || 4,
            stock: parseInt(document.getElementById('productStock').value),
            brand: document.getElementById('productBrand').value.trim(),
            sku: document.getElementById('productSku').value.trim(),
            images: productImages,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (currentEditingProductId) {
            await db.collection('products').doc(currentEditingProductId).update(productData);
            alert('Producto actualizado correctamente');
        } else {
            productData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('products').add(productData);
            alert('Producto creado correctamente');
        }

        resetProductForm();
        hideProductForm();
        loadProducts();

    } catch (error) {
        console.error('Error saving product:', error);
        alert('Error al guardar: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function editProduct(id) {
    try {
        const doc = await db.collection('products').doc(id).get();
        if (!doc.exists) return;

        const data = doc.data();
        currentEditingProductId = id;

        document.getElementById('productName').value = data.name || '';
        document.getElementById('productCategory').value = data.category || '';
        document.getElementById('productDescription').value = data.description || '';
        document.getElementById('productPrice').value = data.price || '';
        document.getElementById('productWholesalePrice').value = data.wholesalePrice || '';
        document.getElementById('productWholesaleQuantity').value = data.wholesaleQuantity || 4;
        document.getElementById('productStock').value = data.stock || '';
        document.getElementById('productBrand').value = data.brand || '';
        document.getElementById('productSku').value = data.sku || '';

        productImages = data.images || [];
        updateImagePreview();

        document.getElementById('saveProductBtn').innerHTML = 'Actualizar Producto';
        showProductForm();

    } catch (error) {
        console.error('Error loading product for edit:', error);
        alert('Error al cargar producto');
    }
}

async function deleteProduct(id) {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;
    try {
        await db.collection('products').doc(id).delete();
        loadProducts();
        alert('Producto eliminado');
    } catch (error) {
        console.error('Error deleting product:', error);
        alert('Error al eliminar');
    }
}

// ============================================
// CAROUSEL & FILES (CLOUDINARY)
// ============================================

window.handleAddCarouselImage = async () => {
    const nameInput = document.getElementById('carouselNameInput');
    const urlInput = document.getElementById('carouselUrlInput');
    const url = urlInput.value.trim();
    const name = nameInput ? nameInput.value.trim() : 'Nueva Imagen';

    if (!url) { alert('URL requerida'); return; }

    try {
        await db.collection('hero_carousel').add({
            name: name,
            image: url,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        urlInput.value = '';
        if (nameInput) nameInput.value = '';
        loadCarouselImages();
        alert('Imagen agregada');
    } catch (e) {
        console.error(e);
        alert('Error al agregar');
    }
};

window.handleAddCarouselFile = function () {
    if (typeof openCloudinaryWidget === 'undefined') {
        alert('Cloudinary no disponible. Recarga la página.');
        return;
    }
    openCloudinaryWidget(async (url) => {
        try {
            const nameInput = document.getElementById('carouselNameInput');
            const name = nameInput ? nameInput.value.trim() : 'Imagen Subida';

            await db.collection('hero_carousel').add({
                name: name,
                image: url,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            if (nameInput) nameInput.value = '';
            loadCarouselImages();
            alert('Imagen subida correctamente');
        } catch (e) {
            console.error(e);
            alert('Error al guardar en base de datos');
        }
    });
};

// Also for PRODUCTS file upload
function handleAddProductFile() {
    if (typeof openCloudinaryWidget === 'undefined') {
        alert('Cloudinary no disponible. Recarga la página.');
        return;
    }
    openCloudinaryWidget((url) => {
        addImageToPreview(url);
    });
}

async function loadCarouselImages() {
    const container = document.getElementById('carouselList');
    if (!container) return;
    container.innerHTML = '<div class="spinner-border text-primary"></div>';

    try {
        const snapshot = await db.collection('hero_carousel').orderBy('createdAt', 'desc').get();
        if (snapshot.empty) {
            container.innerHTML = '<p>No hay imágenes en el carrusel</p>';
            return;
        }

        container.innerHTML = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = 'product-card';
            div.innerHTML = `
                <div style="height: 150px; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 10px;">
                    <img src="${data.image}" style="max-height: 100%; max-width: 100%; object-fit: contain;">
                </div>
                <p style="text-align: center; font-weight: bold;">${data.name || 'Sin nombre'}</p>
                <button class="btn btn-danger btn-sm w-100" onclick="deleteCarouselImage('${doc.id}')">Eliminar</button>
            `;
            container.appendChild(div);
        });
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="text-danger">Error al cargar carrusel</p>';
    }
}

window.deleteCarouselImage = async (id) => {
    if (confirm('¿Eliminar?')) {
        await db.collection('hero_carousel').doc(id).delete();
        loadCarouselImages();
    }
};

window.restoreDefaultCarousel = async () => {
    if (!confirm('¿Restaurar originales? Se borrarán las actuales.')) return;
    alert('Función de restaurar pendientes'); // Placeholder
};


// ============================================
// PROMOTIONS MANAGEMENT
// ============================================
window.loadPromotions = async function () {
    const container = document.getElementById('promotionsList');
    if (!container) return;
    container.innerHTML = '<div class="text-center p-5"><div class="spinner-border text-primary"></div></div>';

    try {
        const snapshot = await db.collection('promotions').orderBy('createdAt', 'desc').get();

        if (snapshot.empty) {
            container.innerHTML = '<div class="alert alert-info">No hay promociones agregadas.</div>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const promo = doc.data();
            html += `
                <div class="product-card">
                    <div style="aspect-ratio: 4/5; background: #f0f0f0; border-radius: 8px; overflow: hidden; margin-bottom: 10px; position:relative;">
                        <img src="${promo.image}" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                    <div class="p-2">
                        <h4 style="font-size: 14px; margin-bottom: 5px; font-weight: bold;">${promo.title || 'Sin Título'}</h4>
                        <button class="btn btn-danger btn-sm w-100" onclick="deletePromotion('${doc.id}')">
                            <i class="fas fa-trash"></i> Eliminar
                        </button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading promotions:', error);
        container.innerHTML = '<div class="alert alert-danger">Error al cargar promociones.</div>';
    }
};

window.handleAddPromotion = async function () {
    const titleInput = document.getElementById('promoTitleInput');
    const imageInput = document.getElementById('promoImageInput');

    const title = titleInput.value.trim();
    const image = imageInput.value.trim();

    if (!image) return alert('Por favor ingresa la URL de la imagen.');

    try {
        await db.collection('promotions').add({
            title,
            image,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert('Promoción agregada exitosamente');
        titleInput.value = '';
        imageInput.value = '';
        loadPromotions();

    } catch (error) {
        console.error('Error adding promotion:', error);
        alert('Error al agregar promoción');
    }
};

window.handleUploadPromotion = function () {
    if (window.openCloudinaryWidget) {
        window.openCloudinaryWidget((url) => {
            document.getElementById('promoImageInput').value = url;
        });
    } else {
        alert("Error: Widget de Cloudinary no cargado. Verifica tu conexión.");
    }
}

window.deletePromotion = async function (id) {
    if (!confirm('¿Estás seguro de eliminar esta promoción?')) return;

    try {
        await db.collection('promotions').doc(id).delete();
        loadPromotions();
    } catch (error) {
        console.error('Error deleting promotion:', error);
        alert('Error al eliminar');
    }
};


// ============================================
// EXPOSE GLOBALS
// ============================================
window.removeProductImage = removeProductImage;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;

// Initialize on load
document.addEventListener('DOMContentLoaded', initializeFirebase);
