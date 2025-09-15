// FixmyCity Admin Dashboard JavaScript

// Supabase configuration (for database only, not auth)
const SUPABASE_URL = 'https://cmsjmmtkdqjamsphsulv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtc2ptbXRrZHFqYW1zcGhzdWx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2NzM2MjAsImV4cCI6MjA3MzI0OTYyMH0.xWc55lDPqKgMxXU6eoDsy2KMBzqwRL4AslSjrNE9ZJM';

let supabaseClient;

// Global variables
let currentUser = null;
let complaints = [];
let filteredComplaints = [];
let currentFilter = 'all';
let otpData = null;
let categoryChart = null;

// Category mapping and icons
const COMPLAINT_CATEGORIES = {
    'road': { name: 'Road', icon: 'fas fa-road', color: '#2563eb' },
    'water': { name: 'Water', icon: 'fas fa-tint', color: '#1e40af' },
    'electricity': { name: 'Electricity', icon: 'fas fa-bolt', color: '#3b82f6' },
    'waste': { name: 'Waste', icon: 'fas fa-trash', color: '#6366f1' },
    'traffic': { name: 'Traffic', icon: 'fas fa-traffic-light', color: '#8b5cf6' },
    'street_light': { name: 'Street Light', icon: 'fas fa-lightbulb', color: '#a855f7' },
    'drainage': { name: 'Drainage', icon: 'fas fa-water', color: '#c084fc' },
    'public_transport': { name: 'Public Transport', icon: 'fas fa-bus', color: '#4f46e5' },
    'other': { name: 'Other', icon: 'fas fa-ellipsis-h', color: '#6b7280' }
};

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    initializeSupabase();
    checkAuth();
    setupEventListeners();
});

// Initialize Supabase client
function initializeSupabase() {
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase client initialized successfully');
    } catch (error) {
        console.error('Error initializing Supabase:', error);
    }
}

// Check authentication status
async function checkAuth() {
    // Ensure Supabase client is initialized
    if (!supabaseClient) {
        console.error('Supabase client not initialized');
        showLogin();
        return;
    }
    
    // Check if admin is logged in from localStorage
    const adminData = localStorage.getItem('currentAdmin');
    if (adminData) {
        currentUser = JSON.parse(adminData);
        showDashboard();
        // Load data after a short delay to ensure DOM is ready
        setTimeout(() => {
            loadComplaints();
            loadStatistics();
        }, 100);
    } else {
        showLogin();
    }
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('otpForm').addEventListener('submit', handleOTPVerification);
    
    // Setup OTP input handling
    setupOTPInputs();
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
        // Check if admin exists in admin table
        const { data: adminData, error: adminError } = await supabaseClient
            .from('admin')
            .select('*')
            .eq('admin_email_id', email)
            .single();
        
        if (adminError) {
            if (adminError.code === 'PGRST116') {
                showError('loginError', 'Admin account not found. Please register first.');
            } else {
                showError('loginError', 'Login failed: ' + adminError.message);
            }
            return;
        }
        
        // For now, we'll skip password validation since we're not storing passwords in admin table
        // In production, you should add a password field to admin table and hash passwords
        // if (adminData.password !== password) {
        //     showError('loginError', 'Invalid password. Please try again.');
        //     return;
        // }
        
        // Store admin data in localStorage
        currentUser = adminData;
        localStorage.setItem('currentAdmin', JSON.stringify(adminData));
        // Show dashboard
        showDashboard();
        initializeNavigation();
        loadComplaints();
        loadStatistics();
        
    } catch (error) {
        console.error('Login error:', error);
        showError('loginError', 'Login failed: ' + error.message);
    }
}

// Handle registration
async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const name = document.getElementById('regName').value;
    const phone = document.getElementById('regPhone').value;
    const state = document.getElementById('regState').value;
    const district = document.getElementById('regDistrict').value;
    
    try {
        // Check if admin already exists
        const { data: existingAdmin, error: checkError } = await supabaseClient
            .from('admin')
            .select('admin_email_id')
            .eq('admin_email_id', email)
            .single();
        
        if (existingAdmin) {
            showError('registerError', 'Admin account already exists with this email. Please login instead.');
            return;
        }
        
        // Create user in Supabase auth first
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password
        });
        
        if (authError) {
            showError('registerError', 'Registration failed: ' + authError.message);
            return;
        }
        
        if (!authData.user) {
            showError('registerError', 'User creation failed. Please try again.');
            return;
        }
        
        // Use the user ID from Supabase auth
        const userId = authData.user.id;
        
        // Insert admin profile with Supabase user ID
        const { data: newAdmin, error: insertError } = await supabaseClient
            .from('admin')
            .insert({
                admin_id: userId,
                admin_name: name,
                admin_phone_no: phone,
                admin_email_id: email,
                admin_state: state,
                admin_district: district
            })
            .select()
            .single();
        
        if (insertError) {
            console.error('Registration error:', insertError);
            showError('registerError', 'Registration failed: ' + insertError.message);
            return;
        }
        
        console.log('Admin created successfully:', newAdmin);
        
        // Show OTP verification page
        showOTPPage(email);
        
    } catch (error) {
        console.error('Registration error:', error);
        showError('registerError', 'Registration failed: ' + error.message);
    }
}

// Show error message
function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    errorElement.className = 'alert alert-danger mt-3';
}

// Show success message
function showSuccess(elementId, message) {
    const errorElement = document.getElementById(elementId);
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    errorElement.className = 'alert alert-success mt-3';
}

// Show login page
function showLogin() {
    document.getElementById('loginPage').style.display = 'block';
    document.getElementById('registerPage').style.display = 'none';
    document.getElementById('dashboard').style.display = 'none';
}

// Show register page
function showRegister() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('registerPage').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
}

// Show dashboard
function showDashboard() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('registerPage').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    
    if (currentUser) {
        document.getElementById('adminName').textContent = currentUser.admin_name || currentUser.email;
        // Update admin display info
        setTimeout(() => {
            updateAdminInfo();
        }, 500);
        
        // Load complaints when dashboard is shown
        loadComplaints();
    }
}

// Load complaints with verification data
async function loadComplaints() {
    try {
        console.log('Loading complaints...');
        
        // Check if supabaseClient is initialized
        if (!supabaseClient) {
            console.error('Supabase client not initialized');
            document.getElementById('complaintsFeed').innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
                    <h5 class="text-danger">Database Connection Error</h5>
                    <p class="text-muted">Unable to connect to database. Please refresh the page.</p>
                </div>
            `;
            return;
        }
        
        // Get complaints data
        const { data: complaintsData, error } = await supabaseClient
            .from('complaints')
            .select(`
                complaint_id,
                user_id,
                location_lat,
                location_long,
                description,
                category,
                voice_url,
                video_url,
                picture_url,
                complaint_status,
                created_at,
                in_progress_at,
                resolved_at
            `)
            .order('created_at', { ascending: false });
        
        // Get user profiles separately
        let userProfiles = [];
        if (complaintsData && complaintsData.length > 0) {
            const userIds = [...new Set(complaintsData.map(c => c.user_id))];
            const { data: profiles } = await supabaseClient
                .from('user_profiles')
                .select('id, display_name')
                .in('id', userIds);
            userProfiles = profiles || [];
        }
        
        if (error) {
            console.error('Error loading complaints:', error);
            document.getElementById('complaintsFeed').innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
                    <h5 class="text-danger">Error Loading Complaints</h5>
                    <p class="text-muted">${error.message}</p>
                </div>
            `;
            return;
        }
        
        console.log('Complaints loaded:', complaintsData?.length || 0);
        
        if (!complaintsData || complaintsData.length === 0) {
            document.getElementById('complaintsFeed').innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                    <h5 class="text-muted">No Complaints Found</h5>
                    <p class="text-muted">No complaints have been registered yet.</p>
                </div>
            `;
            window.complaints = [];
            window.filteredComplaints = [];
            updateDashboardStats();
            return;
        }
        
        // Map database fields to expected format
        const complaintsWithScores = complaintsData.map(complaint => {
            // Find matching user profile by comparing user_id with profile id
            let displayName = 'Anonymous User';
            const userProfile = userProfiles.find(profile => profile.id === complaint.user_id);
            if (userProfile && userProfile.display_name) {
                displayName = userProfile.display_name;
            }
            
            return {
                complaint_id: complaint.complaint_id,
                user_id: complaint.user_id,
                user_name: displayName,
                latitude: complaint.location_lat,
                longitude: complaint.location_long,
                complaint_description: complaint.description,
                complaint_category: complaint.category,
                voice_url: complaint.voice_url,
                video_url: complaint.video_url,
                media_url: complaint.picture_url,
                status: complaint.complaint_status,
                created_at: complaint.created_at,
                in_progress_at: complaint.in_progress_at,
                resolved_at: complaint.resolved_at,
                verification_count: 0, // Default since no verification table
                severity_level: 1 // Default severity
            };
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        window.complaints = complaintsWithScores;
        window.filteredComplaints = complaintsWithScores;
        displayComplaints(complaintsWithScores);
        updateDashboardStats();
        
        // Load location names asynchronously after complaints are displayed
        loadLocationNames();
        
    } catch (error) {
        console.error('Error loading complaints:', error);
    }
}

// Load location names asynchronously
async function loadLocationNames() {
    const locationElements = document.querySelectorAll('.location-text');
    
    for (let element of locationElements) {
        const lat = parseFloat(element.dataset.lat);
        const lng = parseFloat(element.dataset.lng);
        const locationName = element.dataset.name;
        
        if (lat && lng) {
            try {
                const location = await getCachedLocationName(lat, lng, locationName);
                element.textContent = `Location: ${location}`;
            } catch (error) {
                element.textContent = `Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }
        }
    }
}

// Display complaints in Instagram-like feed
function displayComplaints(complaints) {
    const feed = document.getElementById('complaintsFeed');
    
    if (!complaints || complaints.length === 0) {
        feed.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                <h5 class="text-muted">No complaints found</h5>
                <p class="text-muted">No complaints match the current filter criteria.</p>
            </div>
        `;
        return;
    }
    
    feed.innerHTML = complaints.map(complaint => {
        const userInitial = complaint.user_name ? complaint.user_name.charAt(0).toUpperCase() : 'U';
        const timeAgo = getTimeAgo(complaint.created_at);
        const mediaUrl = complaint.media_url;
        const category = classifyComplaint(complaint.complaint_description, complaint.complaint_category);
        const categoryInfo = COMPLAINT_CATEGORIES[category] || COMPLAINT_CATEGORIES['other'];
        
        return `
            <div class="complaint-card" onclick="showComplaintDetails('${complaint.complaint_id}')">
                <!-- Header like Instagram post -->
                <div class="complaint-header">
                    <div class="complaint-user-info">
                        <div class="complaint-avatar">${userInitial}</div>
                        <div class="complaint-user-details">
                            <h6 class="mb-0">${complaint.user_name || 'Anonymous User'}</h6>
                            <small class="text-muted">${timeAgo}</small>
                        </div>
                    </div>
                    <div class="complaint-status status-${complaint.status}">
                        ${complaint.status.replace('_', ' ').toUpperCase()}
                    </div>
                </div>
                
                <!-- Media section -->
                ${mediaUrl ? 
                    `<img src="${mediaUrl}" alt="Complaint media" class="complaint-media">` : 
                    `<div class="complaint-media-placeholder">
                        <i class="fas fa-image"></i>
                    </div>`
                }
                
                <!-- Clean Info Bar -->
                <div class="complaint-info-bar">
                    <div class="verification-count">
                        <i class="fas fa-shield-alt"></i>
                        <span>${complaint.verification_count || 0} verified</span>
                    </div>
                    <div class="severity-level">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Level ${complaint.severity_level || 1}</span>
                    </div>
                </div>
                
                <!-- Caption/Description -->
                <div class="complaint-caption">
                    <strong>${complaint.user_name || 'Anonymous'}:</strong> ${complaint.complaint_description || 'No description provided'}
                </div>
                
                <!-- Professional Complaint Info -->
                <div class="complaint-details">
                    <div class="detail-row">
                        <div class="category-tag">
                            <i class="${categoryInfo.icon}"></i>
                            <span>${categoryInfo.name}</span>
                        </div>
                        <div class="status-indicator status-${complaint.status}">
                            ${complaint.status.replace('_', ' ')}
                        </div>
                    </div>
                    
                    <div class="location-info">
                        <i class="fas fa-map-marker-alt"></i>
                        <span class="location-text" data-lat="${complaint.latitude}" data-lng="${complaint.longitude}">
                            Loading location...
                        </span>
                    </div>
                    
                    <div class="timestamp-info">
                        <i class="fas fa-clock"></i>
                        <span>Submitted ${timeAgo}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Load location names asynchronously
    loadLocationNames();
}

// Show complaint details
async function showComplaintDetails(complaintId) {
    try {
        const { data: complaint, error } = await supabaseClient
            .from('complaints')
            .select(`
                complaint_id,
                user_id,
                location_lat,
                location_long,
                description,
                category,
                voice_url,
                video_url,
                picture_url,
                complaint_status,
                created_at,
                in_progress_at,
                resolved_at
            `)
            .eq('complaint_id', complaintId)
            .single();
        
        // Get user profile separately
        let userProfile = null;
        if (complaint && complaint.user_id) {
            const { data: profile } = await supabaseClient
                .from('user_profiles')
                .select('id, display_name')
                .eq('id', complaint.user_id)
                .single();
            userProfile = profile;
        }
        
        if (error) {
            console.error('Error loading complaint:', error);
            return;
        }
        
        // Map database fields to expected format
        // Extract display name from user_profiles table
        let displayName = 'Anonymous User';
        if (userProfile && userProfile.display_name) {
            displayName = userProfile.display_name;
        }
        
        const mappedComplaint = {
            complaint_id: complaint.complaint_id,
            user_id: complaint.user_id,
            user_name: displayName,
            latitude: complaint.location_lat,
            longitude: complaint.location_long,
            complaint_description: complaint.description,
            complaint_category: complaint.category,
            voice_url: complaint.voice_url,
            video_url: complaint.video_url,
            media_url: complaint.picture_url,
            status: complaint.complaint_status,
            created_at: complaint.created_at,
            in_progress_at: complaint.in_progress_at,
            resolved_at: complaint.resolved_at
        };
        
        const detailsHtml = `
            <div class="row">
                <div class="col-md-8">
                    <h6 class="text-muted mb-3">COMPLAINT DETAILS</h6>
                    <h4 class="mb-3">${mappedComplaint.complaint_category || 'General Complaint'}</h4>
                    <p class="lead">${mappedComplaint.complaint_description || 'No description provided'}</p>
                    
                    ${mappedComplaint.media_url ? `
                        <div class="mb-4">
                            <h6 class="text-muted mb-2">ATTACHED IMAGE</h6>
                            <img src="${mappedComplaint.media_url}" alt="Complaint image" class="img-fluid rounded">
                        </div>
                    ` : ''}
                    
                    ${mappedComplaint.video_url ? `
                        <div class="mb-4">
                            <h6 class="text-muted mb-2">ATTACHED VIDEO</h6>
                            <video controls class="img-fluid rounded">
                                <source src="${mappedComplaint.video_url}" type="video/mp4">
                            </video>
                        </div>
                    ` : ''}
                    
                    ${mappedComplaint.voice_url ? `
                        <div class="mb-4">
                            <h6 class="text-muted mb-2">VOICE NOTE</h6>
                            <audio controls class="w-100">
                                <source src="${mappedComplaint.voice_url}" type="audio/mpeg">
                            </audio>
                        </div>
                    ` : ''}
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="text-muted mb-3">STATUS & VERIFICATION</h6>
                            <div class="mb-3">
                                <strong>Status:</strong>
                                <span class="complaint-status status-${mappedComplaint.status} ms-2">
                                    ${mappedComplaint.status.replace('_', ' ')}
                                </span>
                            </div>
                            <div class="mb-3">
                                <strong>Category:</strong>
                                <span class="ms-2">${mappedComplaint.complaint_category || 'General'}</span>
                            </div>
                            <div class="mb-3">
                                <strong>Location:</strong>
                                <br>
                                <small class="text-muted">
                                    ${mappedComplaint.latitude.toFixed(6)}, ${mappedComplaint.longitude.toFixed(6)}
                                </small>
                            </div>
                            <div class="mb-3">
                                <strong>Created:</strong>
                                <br>
                                <small class="text-muted">
                                    ${new Date(mappedComplaint.created_at).toLocaleString()}
                                </small>
                            </div>
                            ${mappedComplaint.in_progress_at ? `
                                <div class="mb-3">
                                    <strong>In Progress Since:</strong>
                                    <br>
                                    <small class="text-muted">
                                        ${new Date(mappedComplaint.in_progress_at).toLocaleString()}
                                    </small>
                                </div>
                            ` : ''}
                            ${mappedComplaint.resolved_at ? `
                                <div class="mb-3">
                                    <strong>Resolved At:</strong>
                                    <br>
                                    <small class="text-muted">
                                        ${new Date(mappedComplaint.resolved_at).toLocaleString()}
                                    </small>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('complaintDetails').innerHTML = detailsHtml;
        
        // Store current complaint for status updates
        window.currentComplaint = mappedComplaint;
        
        // Update button states
        const inProgressBtn = document.getElementById('setInProgressBtn');
        const resolvedBtn = document.getElementById('setResolvedBtn');
        
        inProgressBtn.style.display = mappedComplaint.status === 'pending' ? 'inline-block' : 'none';
        resolvedBtn.style.display = mappedComplaint.status !== 'resolved' ? 'inline-block' : 'none';
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('complaintModal'));
        modal.show();
        
    } catch (error) {
        console.error('Error loading complaint details:', error);
    }
}

// Update complaint status
async function updateStatus(newStatus) {
    if (!window.currentComplaint) return;
    
    try {
        const updateData = {
            complaint_status: newStatus
        };
        
        if (newStatus === 'in_progress') {
            updateData.in_progress_at = new Date().toISOString();
        } else if (newStatus === 'resolved') {
            updateData.resolved_at = new Date().toISOString();
        }
        
        const { error } = await supabaseClient
            .from('complaints')
            .update(updateData)
            .eq('complaint_id', window.currentComplaint.complaint_id);
        
        if (error) {
            console.error('Error updating status:', error);
            alert('Failed to update status: ' + error.message);
            return;
        }
        
        alert('Status updated successfully!');
        
        // Hide modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('complaintModal'));
        if (modal) {
            modal.hide();
        }
        
        // Reload complaints
        loadComplaints();
        
    } catch (error) {
        console.error('Error updating status:', error);
        alert('Failed to update status: ' + error.message);
    }
}

// Load statistics
async function loadStatistics() {
    try {
        // Check if supabaseClient is initialized
        if (!supabaseClient) {
            console.error('Supabase client not initialized for statistics');
            return;
        }
        
        const { data: complaints, error } = await supabaseClient
            .from('complaints')
            .select('complaint_status');
        
        if (error) {
            console.error('Error loading statistics:', error);
            return;
        }
        
        // Update dashboard statistics
        updateDashboardStats();
        
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// Update dashboard statistics
function updateDashboardStats() {
    const complaintsArray = window.complaints || [];
    const total = complaintsArray.length;
    const pending = complaintsArray.filter(c => c.status === 'pending').length;
    const inProgress = complaintsArray.filter(c => c.status === 'in_progress').length;
    const resolved = complaintsArray.filter(c => c.status === 'resolved').length;
    
    document.getElementById('totalComplaints').textContent = total;
    document.getElementById('pendingComplaints').textContent = pending;
    document.getElementById('inProgressComplaints').textContent = inProgress;
    document.getElementById('resolvedComplaints').textContent = resolved;
    
    // Update filter badges
    document.getElementById('allBadge').textContent = total;
    document.getElementById('pendingBadge').textContent = pending;
    document.getElementById('progressBadge').textContent = inProgress;
    document.getElementById('resolvedBadge').textContent = resolved;
    
    // Update category statistics
    updateCategoryStats();
    updateCategoryChart();
}

// Classify complaint based on description and category
function classifyComplaint(description, category) {
    if (category && COMPLAINT_CATEGORIES[category.toLowerCase()]) {
        return category.toLowerCase();
    }
    
    const desc = description.toLowerCase();
    
    // Road-related keywords
    if (desc.includes('road') || desc.includes('pothole') || desc.includes('street') || desc.includes('pavement')) {
        return 'road';
    }
    
    // Water-related keywords
    if (desc.includes('water') || desc.includes('tap') || desc.includes('supply') || desc.includes('leak')) {
        return 'water';
    }
    
    // Electricity-related keywords
    if (desc.includes('electricity') || desc.includes('power') || desc.includes('electric') || desc.includes('current')) {
        return 'electricity';
    }
    
    // Waste-related keywords
    if (desc.includes('waste') || desc.includes('garbage') || desc.includes('trash') || desc.includes('dustbin')) {
        return 'waste';
    }
    
    // Traffic-related keywords
    if (desc.includes('traffic') || desc.includes('signal') || desc.includes('jam') || desc.includes('vehicle')) {
        return 'traffic';
    }
    
    // Street light keywords
    if (desc.includes('light') || desc.includes('lamp') || desc.includes('street light') || desc.includes('bulb')) {
        return 'street_light';
    }
    
    // Drainage keywords
    if (desc.includes('drain') || desc.includes('sewer') || desc.includes('flood') || desc.includes('water logging')) {
        return 'drainage';
    }
    
    // Public transport keywords
    if (desc.includes('bus') || desc.includes('transport') || desc.includes('auto') || desc.includes('metro')) {
        return 'public_transport';
    }
    
    return 'other';
}

// Update category statistics
function updateCategoryStats() {
    const categoryStats = {};
    
    // Initialize all categories
    Object.keys(COMPLAINT_CATEGORIES).forEach(key => {
        categoryStats[key] = 0;
    });
    
    // Count complaints by category
    const complaintsArray = window.complaints || [];
    complaintsArray.forEach(complaint => {
        const category = classifyComplaint(complaint.complaint_description, complaint.complaint_category);
        categoryStats[category]++;
    });
    
    // Update category stats display
    const statsContainer = document.getElementById('categoryStats');
    statsContainer.innerHTML = Object.entries(categoryStats)
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => {
            const categoryInfo = COMPLAINT_CATEGORIES[category];
            const percentage = complaintsArray.length > 0 ? ((count / complaintsArray.length) * 100).toFixed(1) : 0;
            return `
                <div class="category-stat-item mb-2">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center">
                            <i class="${categoryInfo.icon} me-2" style="color: ${categoryInfo.color}"></i>
                            <span>${categoryInfo.name}</span>
                        </div>
                        <div class="text-end">
                            <strong>${count}</strong>
                            <small class="text-muted">(${percentage}%)</small>
                        </div>
                    </div>
                    <div class="progress mt-1" style="height: 4px;">
                        <div class="progress-bar" style="width: ${percentage}%; background-color: ${categoryInfo.color}"></div>
                    </div>
                </div>
            `;
        }).join('');
}

// Update category chart
function updateCategoryChart() {
    const categoryStats = {};
    
    // Initialize all categories
    Object.keys(COMPLAINT_CATEGORIES).forEach(key => {
        categoryStats[key] = 0;
    });
    
    // Count complaints by category
    const complaintsArray = window.complaints || [];
    complaintsArray.forEach(complaint => {
        const category = classifyComplaint(complaint.complaint_description, complaint.complaint_category);
        categoryStats[category]++;
    });
    
    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    if (categoryChart) {
        categoryChart.destroy();
    }
    
    const labels = Object.keys(categoryStats).map(key => COMPLAINT_CATEGORIES[key].name);
    const data = Object.values(categoryStats);
    const colors = Object.keys(categoryStats).map(key => COMPLAINT_CATEGORIES[key].color);
    
    categoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Number of Complaints',
                data: data,
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Apply advanced filters
function applyFilters() {
    const categoryFilter = document.getElementById('categoryFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const locationFilter = document.getElementById('locationFilter').value.toLowerCase();
    const verificationFilter = document.getElementById('verificationFilter').value;
    
    const complaintsArray = window.complaints || [];
    filteredComplaints = complaintsArray.filter(complaint => {
        // Category filter
        if (categoryFilter !== 'all') {
            const complaintCategory = classifyComplaint(complaint.complaint_description, complaint.complaint_category);
            if (complaintCategory !== categoryFilter) {
                return false;
            }
        }
        
        // Status filter
        if (statusFilter !== 'all' && complaint.status !== statusFilter) {
            return false;
        }
        
        // Location filter
        if (locationFilter) {
            const locationText = document.querySelector(`[data-lat="${complaint.latitude}"][data-lng="${complaint.longitude}"]`)?.textContent?.toLowerCase() || '';
            if (!locationText.includes(locationFilter)) {
                return false;
            }
        }
        
        // Verification filter
        if (verificationFilter !== 'all') {
            const verificationCount = complaint.verification_count || 0;
            switch (verificationFilter) {
                case '0':
                    if (verificationCount !== 0) return false;
                    break;
                case '1-5':
                    if (verificationCount < 1 || verificationCount > 5) return false;
                    break;
                case '6-10':
                    if (verificationCount < 6 || verificationCount > 10) return false;
                    break;
                case '10+':
                    if (verificationCount < 10) return false;
                    break;
            }
        }
        
        return true;
    });
    
    displayComplaints(filteredComplaints);
}

// Utility function to format time ago
function getTimeAgo(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
        return 'Just now';
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
        const days = Math.floor(diffInSeconds / 86400);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
}

// Filter complaints by status
function filterComplaints(status) {
    currentFilter = status;
    
    // Update active tab
    document.querySelectorAll('#statusTabs .nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    const complaintsArray = window.complaints || [];
    
    if (status === 'all') {
        filteredComplaints = complaintsArray;
    } else {
        filteredComplaints = complaintsArray.filter(complaint => complaint.status === status);
    }
    
    displayComplaints(filteredComplaints);
    
    // Update active tab
    event.target.classList.add('active');
}

// Navigation functions
function showSection(sectionName) {
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to clicked nav item
    event.target.closest('.nav-item').classList.add('active');
    
    // Hide all sections
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('analyticsSection').style.display = 'none';
    document.getElementById('adminProfileSection').style.display = 'none';
    
    // Hide/show dashboard sidebar based on section
    const dashboardSidebar = document.getElementById('dashboardSidebar');
    const mainContent = document.getElementById('mainContent');
    
    if (sectionName === 'dashboard') {
        document.getElementById('dashboardSection').style.display = 'block';
        dashboardSidebar.style.display = 'block';
        mainContent.className = 'col-md-7';
    } else {
        dashboardSidebar.style.display = 'none';
        mainContent.className = 'col-md-10';
        
        if (sectionName === 'analytics') {
            document.getElementById('analyticsSection').style.display = 'block';
        } else if (sectionName === 'admin-profile') {
            document.getElementById('adminProfileSection').style.display = 'block';
        }
    }
}

// Initialize dashboard on load
function initializeNavigation() {
    // Set dashboard as default active section
    document.querySelector('.nav-item').classList.add('active');
    showSection('dashboard');
}

// Logout
async function logout() {
    // Clear admin data from localStorage
    localStorage.removeItem('currentAdmin');
    currentUser = null;
    showLogin();
}

// OTP Functions
function showOTPPage(email) {
    // Hide all pages
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('registerPage').style.display = 'none';
    document.getElementById('dashboard').style.display = 'none';
    
    // Show OTP page
    document.getElementById('otpPage').style.display = 'block';
    
    // Store OTP data
    otpData = {
        email: email,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
    };
    
    // Start countdown timer
    startOTPTimer();
    
    // Clear OTP inputs
    clearOTPInputs();
}

function setupOTPInputs() {
    const otpInputs = document.querySelectorAll('.otp-input');
    
    otpInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            
            // Only allow numbers
            if (!/^\d*$/.test(value)) {
                e.target.value = value.replace(/\D/g, '');
                return;
            }
            
            // Move to next input if current is filled
            if (value.length === 1 && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
            
            // Auto-submit if all fields are filled
            if (value.length === 1 && index === otpInputs.length - 1) {
                const allFilled = Array.from(otpInputs).every(input => input.value.length === 1);
                if (allFilled) {
                    setTimeout(() => handleOTPVerification({ preventDefault: () => {} }), 100);
                }
            }
        });
        
        input.addEventListener('keydown', (e) => {
            // Handle backspace
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                otpInputs[index - 1].focus();
            }
        });
        
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').replace(/\D/g, '');
            if (pastedData.length === 6) {
                pastedData.split('').forEach((digit, i) => {
                    if (otpInputs[i]) {
                        otpInputs[i].value = digit;
                    }
                });
                otpInputs[5].focus();
            }
        });
    });
}

function clearOTPInputs() {
    const otpInputs = document.querySelectorAll('.otp-input');
    otpInputs.forEach(input => {
        input.value = '';
        input.classList.remove('filled');
    });
    otpInputs[0].focus();
}

function getOTPCode() {
    const otpInputs = document.querySelectorAll('.otp-input');
    return Array.from(otpInputs).map(input => input.value).join('');
}

function startOTPTimer() {
    if (otpTimer) {
        clearInterval(otpTimer);
    }
    
    const updateTimer = () => {
        if (!otpData || !otpData.expiresAt) return;
        
        const now = new Date();
        const timeLeft = Math.max(0, Math.floor((otpData.expiresAt - now) / 1000));
        
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        document.getElementById('otpTimer').textContent = `(${timeString})`;
        
        if (timeLeft === 0) {
            updateOTPStatus('expired', 'Code expired - please request a new one');
            clearInterval(otpTimer);
        }
    };
    
    updateTimer();
    otpTimer = setInterval(updateTimer, 1000);
}

function updateOTPStatus(status, message) {
    const statusElement = document.getElementById('otpStatus');
    const statusContainer = statusElement.parentElement;
    
    statusElement.textContent = message;
    
    // Update status styling
    statusContainer.className = 'otp-status alert';
    switch (status) {
        case 'pending':
            statusContainer.classList.add('alert-info');
            break;
        case 'verified':
            statusContainer.classList.add('alert-success');
            break;
        case 'expired':
        case 'failed':
            statusContainer.classList.add('alert-danger');
            break;
    }
}

async function handleOTPVerification(e) {
    e.preventDefault();
    
    const otpCode = getOTPCode();
    if (otpCode.length !== 6) {
        showError('otpError', 'Please enter a valid 6-digit code');
        return;
    }
    
    try {
        updateOTPStatus('pending', 'Verifying code...');
        
        // Simulate OTP verification (in real app, this would verify with your OTP system)
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Simulate successful verification
        updateOTPStatus('verified', 'Code verified successfully!');
        
        // Clear timer
        if (otpTimer) {
            clearInterval(otpTimer);
        }
        
        // Show success message and redirect to login
        setTimeout(() => {
            showSuccess('otpError', 'Email verified successfully! You can now login.');
            setTimeout(() => {
                showLogin();
            }, 2000);
        }, 1000);
        
    } catch (error) {
        console.error('OTP verification error:', error);
        updateOTPStatus('failed', 'Verification failed - please try again');
        showError('otpError', 'Verification failed: ' + error.message);
    }
}

async function resendOTP() {
    if (!otpData) return;
    
    try {
        updateOTPStatus('pending', 'Sending new code...');
        
        // Simulate resending OTP
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Update expiry time
        otpData.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        
        // Restart timer
        startOTPTimer();
        
        // Clear inputs
        clearOTPInputs();
        
        updateOTPStatus('pending', 'New code sent - waiting for verification');
        showSuccess('otpError', 'New verification code sent successfully!');
        
    } catch (error) {
        console.error('Resend OTP error:', error);
        showError('otpError', 'Failed to resend code: ' + error.message);
    }
}



// Location Helper Function with Reverse Geocoding
async function getLocationName(lat, lng, locationName) {
    // If location name is provided in the complaint data, use it
    if (locationName && locationName.trim() !== '') {
        return locationName;
    }
    
    try {
        // Use OpenStreetMap Nominatim API for reverse geocoding (free, no API key required)
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
        const data = await response.json();
        
        if (data && data.display_name) {
            // Extract meaningful parts of the address
            const address = data.address;
            let locationParts = [];
            
            // Add road/street name if available
            if (address.road) {
                locationParts.push(address.road);
            }
            
            // Add suburb/neighbourhood if available
            if (address.suburb) {
                locationParts.push(address.suburb);
            } else if (address.neighbourhood) {
                locationParts.push(address.neighbourhood);
            }
            
            // Add city/town
            if (address.city) {
                locationParts.push(address.city);
            } else if (address.town) {
                locationParts.push(address.town);
            } else if (address.village) {
                locationParts.push(address.village);
            }
            
            // Add state if it's not already implied
            if (address.state && !locationParts.some(part => part.includes(address.state))) {
                locationParts.push(address.state);
            }
            
            // Return formatted location (limit to 3 most relevant parts)
            const formattedLocation = locationParts.slice(0, 3).join(', ');
            return formattedLocation || data.display_name.split(',').slice(0, 3).join(', ');
        }
    } catch (error) {
        console.warn('Reverse geocoding failed:', error);
    }
    
    // Fallback to coordinate display if API fails
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// Cache for location lookups to avoid repeated API calls
const locationCache = new Map();

function getCachedLocationName(lat, lng, locationName) {
    // If location name is provided, use it
    if (locationName && locationName.trim() !== '') {
        return Promise.resolve(locationName);
    }
    
    // Create cache key
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    
    // Check cache first
    if (locationCache.has(cacheKey)) {
        return Promise.resolve(locationCache.get(cacheKey));
    }
    
    // Fetch from API and cache result
    return getLocationName(lat, lng, locationName).then(result => {
        locationCache.set(cacheKey, result);
        return result;
    });
}

// Modern Dashboard Functions
function updateAdminInfo() {
    if (currentUser) {
        const adminName = currentUser.admin_name || 'Admin User';
        const adminLocation = `${currentUser.admin_district || 'District'}, ${currentUser.admin_state || 'State'}`;
        
        document.getElementById('adminDisplayName').textContent = adminName;
        document.getElementById('adminLocation').textContent = adminLocation;
    }
}

function updateDashboardStats(complaints) {
    // Calculate urgent complaints (pending for more than 3 days)
    const urgentCount = complaints.filter(c => {
        const daysSinceCreated = (new Date() - new Date(c.created_at)) / (1000 * 60 * 60 * 24);
        return c.complaint_status === 'pending' && daysSinceCreated > 3;
    }).length;
    
    // Calculate resolved today
    const today = new Date().toDateString();
    const resolvedTodayCount = complaints.filter(c => {
        return c.complaint_status === 'resolved' && 
               c.resolved_at && 
               new Date(c.resolved_at).toDateString() === today;
    }).length;
    
    // Update dashboard stats
    document.getElementById('urgentComplaints').textContent = urgentCount;
    document.getElementById('resolvedToday').textContent = resolvedTodayCount;
    
    // Update badge counts
    const pendingCount = complaints.filter(c => c.complaint_status === 'pending').length;
    const progressCount = complaints.filter(c => c.complaint_status === 'in_progress').length;
    const resolvedCount = complaints.filter(c => c.complaint_status === 'resolved').length;
    
    document.getElementById('pendingBadge').textContent = pendingCount;
    document.getElementById('progressBadge').textContent = progressCount;
    document.getElementById('resolvedBadge').textContent = resolvedCount;
}

function filterComplaints(status) {
    currentFilter = status;
    
    // Update active tab
    document.querySelectorAll('#statusTabs .nav-link').forEach(link => {
        link.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Filter complaints
    if (status === 'all') {
        filteredComplaints = allComplaints;
    } else {
        filteredComplaints = allComplaints.filter(c => c.complaint_status === status);
    }
    
    displayComplaints(filteredComplaints);
}

function filterByStatus(status) {
    filterComplaints(status);
    
    // Update tab selection
    const tabs = document.querySelectorAll('#statusTabs .nav-link');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    const targetTab = Array.from(tabs).find(tab => 
        tab.textContent.toLowerCase().includes(status) || 
        (status === 'pending' && tab.textContent.includes('Pending'))
    );
    if (targetTab) targetTab.classList.add('active');
}

function toggleView() {
    // Toggle between list and grid view
    const feed = document.getElementById('complaintsFeed');
    feed.classList.toggle('grid-view');
    
    const button = event.target.closest('button');
    const icon = button.querySelector('i');
    
    if (feed.classList.contains('grid-view')) {
        icon.className = 'fas fa-list me-1';
        button.innerHTML = '<i class="fas fa-list me-1"></i>List View';
    } else {
        icon.className = 'fas fa-th-large me-1';
        button.innerHTML = '<i class="fas fa-th-large me-1"></i>Grid View';
    }
}

function exportData() {
    // Export complaints data as CSV
    const csvContent = generateCSV(filteredComplaints);
    downloadCSV(csvContent, `complaints_${currentFilter}_${new Date().toISOString().split('T')[0]}.csv`);
}

function generateCSV(complaints) {
    const headers = ['ID', 'Category', 'Status', 'Description', 'Location', 'Created Date', 'Verification Score'];
    const rows = complaints.map(complaint => [
        complaint.complaint_id,
        complaint.category || 'General',
        complaint.complaint_status,
        complaint.description ? complaint.description.replace(/,/g, ';') : 'No description',
        `${complaint.location_lat}, ${complaint.location_long}`,
        new Date(complaint.created_at).toLocaleDateString(),
        complaint.verificationScore || 0
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Utility functions
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
