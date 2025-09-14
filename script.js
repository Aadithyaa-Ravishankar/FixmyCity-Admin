// FixmyCity Admin Dashboard JavaScript

// Supabase configuration (for database only, not auth)
const SUPABASE_URL = 'https://cmsjmmtkdqjamsphsulv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtc2ptbXRrZHFqYW1zcGhzdWx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2NzM2MjAsImV4cCI6MjA3MzI0OTYyMH0.xWc55lDPqKgMxXU6eoDsy2KMBzqwRL4AslSjrNE9ZJM';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global variables
let currentUser = null;
let currentComplaint = null;
let otpData = null;
let otpTimer = null;

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    setupEventListeners();
});

// Check authentication status
async function checkAuth() {
    // Check if admin is logged in from localStorage
    const adminData = localStorage.getItem('currentAdmin');
    if (adminData) {
        currentUser = JSON.parse(adminData);
        showDashboard();
        loadComplaints();
        loadStatistics();
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
        
        showDashboard();
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
        document.getElementById('adminName').textContent = currentUser.email;
    }
}

// Load complaints with verification data
async function loadComplaints() {
    try {
        // Get complaints with verification data
        const { data: complaints, error } = await supabaseClient
            .from('complaints')
            .select(`
                *,
                verification (
                    verified_true,
                    verified_false,
                    severity
                )
            `)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error loading complaints:', error);
            return;
        }
        
        // Calculate verification scores and sort
        const complaintsWithScores = complaints.map(complaint => {
            const verifications = complaint.verification || [];
            const verifiedTrue = verifications.filter(v => v.verified_true).length;
            const verifiedFalse = verifications.filter(v => v.verified_false).length;
            const avgSeverity = verifications.length > 0 
                ? verifications.reduce((sum, v) => sum + v.severity, 0) / verifications.length 
                : 0;
            
            return {
                ...complaint,
                verificationScore: verifiedTrue - verifiedFalse,
                avgSeverity: avgSeverity,
                verificationCount: verifications.length
            };
        }).sort((a, b) => b.verificationScore - a.verificationScore);
        
        displayComplaints(complaintsWithScores);
        
    } catch (error) {
        console.error('Error loading complaints:', error);
    }
}

// Display complaints in Instagram-like feed
function displayComplaints(complaints) {
    const feed = document.getElementById('complaintsFeed');
    
    if (complaints.length === 0) {
        feed.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-inbox fa-3x text-muted"></i>
                <p class="text-muted mt-3">No complaints found</p>
            </div>
        `;
        return;
    }
    
    feed.innerHTML = complaints.map(complaint => {
        const verificationScore = complaint.verificationScore || 0;
        const verificationCount = complaint.verificationCount || 0;
        const avgSeverity = complaint.avgSeverity || 0;
        const userName = `User_${complaint.user_id.substring(0, 8)}`;
        const userInitial = userName.charAt(5);
        
        return `
            <div class="complaint-card" onclick="showComplaintDetails('${complaint.complaint_id}')">
                <!-- Header like Instagram post -->
                <div class="complaint-header">
                    <div class="complaint-user-info">
                        <div class="complaint-avatar">${userInitial}</div>
                        <div class="complaint-user-details">
                            <h6>${userName}</h6>
                            <small>${formatDate(complaint.created_at)}</small>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="complaint-status status-${complaint.complaint_status}">
                            ${complaint.complaint_status.replace('_', ' ')}
                        </span>
                        <span class="verification-badge">
                            <i class="fas fa-check-circle me-1"></i>
                            ${verificationScore > 0 ? '+' : ''}${verificationScore}
                        </span>
                    </div>
                </div>
                
                <!-- Media section -->
                ${complaint.picture_url ? `
                    <img src="${complaint.picture_url}" alt="Complaint image" class="complaint-media">
                ` : `
                    <div class="complaint-media-placeholder">
                        <i class="fas fa-image"></i>
                    </div>
                `}
                
                <!-- Actions section -->
                <div class="complaint-actions">
                    <div class="complaint-action-buttons">
                        <button class="complaint-action-btn like" onclick="event.stopPropagation(); toggleLike('${complaint.complaint_id}')">
                            <i class="fas fa-heart"></i>
                        </button>
                        <button class="complaint-action-btn comment" onclick="event.stopPropagation(); showComplaintDetails('${complaint.complaint_id}')">
                            <i class="fas fa-comment"></i>
                        </button>
                        <button class="complaint-action-btn share" onclick="event.stopPropagation(); shareComplaint('${complaint.complaint_id}')">
                            <i class="fas fa-share"></i>
                        </button>
                    </div>
                    <div class="complaint-likes">
                        ${verificationCount} verification${verificationCount !== 1 ? 's' : ''}
                        ${avgSeverity > 0 ? `• <span class="severity-indicator severity-${Math.ceil(avgSeverity)}"></span>Severity: ${avgSeverity.toFixed(1)}/5` : ''}
                    </div>
                </div>
                
                <!-- Caption/Description -->
                <div class="complaint-caption">
                    <strong>${complaint.category || 'General Complaint'}</strong>
                    <span>${complaint.description || 'No description provided'}</span>
                </div>
                
                <!-- Category tag -->
                <div class="complaint-category">
                    <i class="fas fa-tag me-1"></i>${complaint.category || 'General'}
                </div>
                
                <!-- Comments section -->
                <div class="complaint-comments">
                    <div class="complaint-comment">
                        <strong>Location:</strong> ${complaint.location_lat.toFixed(4)}, ${complaint.location_long.toFixed(4)}
                    </div>
                    <div class="complaint-comment">
                        <strong>Posted:</strong> ${new Date(complaint.created_at).toLocaleString()}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Show complaint details
async function showComplaintDetails(complaintId) {
    try {
        const { data: complaint, error } = await supabaseClient
            .from('complaints')
            .select(`
                *,
                verification (
                    verified_true,
                    verified_false,
                    severity
                )
            `)
            .eq('complaint_id', complaintId)
            .single();
        
        if (error) {
            console.error('Error loading complaint:', error);
            return;
        }
        
        currentComplaint = complaint;
        
        const verifications = complaint.verification || [];
        const verifiedTrue = verifications.filter(v => v.verified_true).length;
        const verifiedFalse = verifications.filter(v => v.verified_false).length;
        const avgSeverity = verifications.length > 0 
            ? verifications.reduce((sum, v) => sum + v.severity, 0) / verifications.length 
            : 0;
        
        const detailsHtml = `
            <div class="row">
                <div class="col-md-8">
                    <h6 class="text-muted mb-3">COMPLAINT DETAILS</h6>
                    <h4 class="mb-3">${complaint.category || 'General Complaint'}</h4>
                    <p class="lead">${complaint.description || 'No description provided'}</p>
                    
                    ${complaint.picture_url ? `
                        <div class="mb-4">
                            <h6 class="text-muted mb-2">ATTACHED IMAGE</h6>
                            <img src="${complaint.picture_url}" alt="Complaint image" class="img-fluid rounded">
                        </div>
                    ` : ''}
                    
                    ${complaint.video_url ? `
                        <div class="mb-4">
                            <h6 class="text-muted mb-2">ATTACHED VIDEO</h6>
                            <video controls class="img-fluid rounded">
                                <source src="${complaint.video_url}" type="video/mp4">
                            </video>
                        </div>
                    ` : ''}
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="text-muted mb-3">STATUS & VERIFICATION</h6>
                            <div class="mb-3">
                                <strong>Status:</strong>
                                <span class="complaint-status status-${complaint.complaint_status} ms-2">
                                    ${complaint.complaint_status.replace('_', ' ')}
                                </span>
                            </div>
                            <div class="mb-3">
                                <strong>Verification Score:</strong>
                                <span class="badge bg-success ms-2">${verifiedTrue - verifiedFalse}</span>
                            </div>
                            <div class="mb-3">
                                <strong>Average Severity:</strong>
                                <span class="severity-indicator severity-${Math.ceil(avgSeverity)}"></span>
                                ${avgSeverity.toFixed(1)}/5
                            </div>
                            <div class="mb-3">
                                <strong>Location:</strong>
                                <br>
                                <small class="text-muted">
                                    ${complaint.location_lat.toFixed(6)}, ${complaint.location_long.toFixed(6)}
                                </small>
                            </div>
                            <div class="mb-3">
                                <strong>Created:</strong>
                                <br>
                                <small class="text-muted">
                                    ${new Date(complaint.created_at).toLocaleString()}
                                </small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('complaintDetails').innerHTML = detailsHtml;
        
        // Update button states
        const inProgressBtn = document.getElementById('setInProgressBtn');
        const resolvedBtn = document.getElementById('setResolvedBtn');
        
        inProgressBtn.style.display = complaint.complaint_status === 'pending' ? 'inline-block' : 'none';
        resolvedBtn.style.display = complaint.complaint_status !== 'resolved' ? 'inline-block' : 'none';
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('complaintModal'));
        modal.show();
        
    } catch (error) {
        console.error('Error loading complaint details:', error);
    }
}

// Update complaint status
async function updateStatus(newStatus) {
    if (!currentComplaint) return;
    
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
            .eq('complaint_id', currentComplaint.complaint_id);
        
        if (error) {
            console.error('Error updating status:', error);
            alert('Failed to update status: ' + error.message);
            return;
        }
        
        // Close modal and refresh
        const modal = bootstrap.Modal.getInstance(document.getElementById('complaintModal'));
        modal.hide();
        
        loadComplaints();
        loadStatistics();
        
        alert('Status updated successfully!');
        
    } catch (error) {
        console.error('Error updating status:', error);
        alert('Failed to update status: ' + error.message);
    }
}

// Load statistics
async function loadStatistics() {
    try {
        const { data: complaints, error } = await supabaseClient
            .from('complaints')
            .select('complaint_status');
        
        if (error) {
            console.error('Error loading statistics:', error);
            return;
        }
        
        const stats = {
            total: complaints.length,
            pending: complaints.filter(c => c.complaint_status === 'pending').length,
            in_progress: complaints.filter(c => c.complaint_status === 'in_progress').length,
            resolved: complaints.filter(c => c.complaint_status === 'resolved').length
        };
        
        document.getElementById('totalComplaints').textContent = stats.total;
        document.getElementById('pendingComplaints').textContent = stats.pending;
        document.getElementById('inProgressComplaints').textContent = stats.in_progress;
        document.getElementById('resolvedComplaints').textContent = stats.resolved;
        
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
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

// Instagram-like interaction functions
function toggleLike(complaintId) {
    // Simulate like functionality
    const likeBtn = event.target.closest('.complaint-action-btn.like');
    const icon = likeBtn.querySelector('i');
    
    if (icon.classList.contains('fas')) {
        icon.classList.remove('fas');
        icon.classList.add('far');
        likeBtn.style.color = '#262626';
    } else {
        icon.classList.remove('far');
        icon.classList.add('fas');
        likeBtn.style.color = '#ed4956';
    }
}

function shareComplaint(complaintId) {
    // Simulate share functionality
    if (navigator.share) {
        navigator.share({
            title: 'FixmyCity Complaint',
            text: 'Check out this complaint on FixmyCity',
            url: window.location.href
        });
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(window.location.href);
        alert('Link copied to clipboard!');
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
