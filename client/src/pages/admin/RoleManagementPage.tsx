import { useState, useEffect } from 'react';
import { Shield, Plus, Edit2, Trash2, CheckSquare, Square, Info } from 'lucide-react';
import {
  useRoles,
  usePermissions,
  useRolePermissions,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useSaveRolePermissions,
} from '../../api/hooks/useRoles';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import { PageTransition, AnimatedCard, RippleButton, AnimatedModal } from '../../components/ui/Animations';
import toast from 'react-hot-toast';

export default function RoleManagementPage() {
  const { data: roles = [], isLoading: loadingRoles } = useRoles();
  const { data: permissions = [], isLoading: loadingPerms } = usePermissions();
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const { data: activePermissions = [], refetch: refetchRolePerms } = useRolePermissions(selectedRoleId);

  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole();
  const deleteMutation = useDeleteRole();
  const savePermsMutation = useSaveRolePermissions();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any | null>(null);
  const [roleName, setRoleName] = useState('');
  const [description, setDescription] = useState('');

  // Selected permissions state for the currently viewing role
  const [checkedPerms, setCheckedPerms] = useState<number[]>([]);

  useEffect(() => {
    if (roles.length > 0 && selectedRoleId === null) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles]);

  useEffect(() => {
    if (activePermissions) {
      setCheckedPerms(activePermissions);
    }
  }, [activePermissions, selectedRoleId]);

  const handleOpenCreate = () => {
    setEditingRole(null);
    setRoleName('');
    setDescription('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (role: any) => {
    setEditingRole(role);
    setRoleName(role.role_name);
    setDescription(role.description || '');
    setIsModalOpen(true);
  };

  const handleSaveRole = () => {
    if (!roleName.trim()) {
      toast.error('Role name is required');
      return;
    }

    if (editingRole) {
      updateMutation.mutate(
        { id: editingRole.id, role_name: roleName, description },
        {
          onSuccess: () => {
            toast.success('Role updated successfully');
            setIsModalOpen(false);
          },
          onError: (err: any) => {
            toast.error(err.response?.data?.error || 'Failed to update role');
          },
        }
      );
    } else {
      createMutation.mutate(
        { role_name: roleName, description },
        {
          onSuccess: () => {
            toast.success('Role created successfully');
            setIsModalOpen(false);
          },
          onError: (err: any) => {
            toast.error(err.response?.data?.error || 'Failed to create role');
          },
        }
      );
    }
  };

  const handleDeleteRole = (id: number) => {
    if (!confirm('Are you sure you want to delete this custom role? Users assigned to this role will lose their custom permissions.')) {
      return;
    }

    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success('Role deleted');
        if (selectedRoleId === id) {
          setSelectedRoleId(roles.find((r: any) => r.id !== id)?.id || null);
        }
      },
      onError: (err: any) => {
        toast.error(err.response?.data?.error || 'Failed to delete role');
      },
    });
  };

  const togglePermission = (permId: number) => {
    setCheckedPerms((prev) =>
      prev.includes(permId) ? prev.filter((id) => id !== permId) : [...prev, permId]
    );
  };

  const handleSavePermissions = () => {
    if (!selectedRoleId) return;
    savePermsMutation.mutate(
      { roleId: selectedRoleId, permissionIds: checkedPerms },
      {
        onSuccess: () => {
          toast.success('Permissions updated successfully');
        },
        onError: (err: any) => {
          toast.error(err.response?.data?.error || 'Failed to save permissions');
        },
      }
    );
  };

  // Group permissions by module
  const groupedPermissions = permissions.reduce((acc: any, p: any) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module].push(p);
    return acc;
  }, {});

  const selectedRole = roles.find((r: any) => r.id === selectedRoleId);

  return (
    <PageTransition className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PremiumPageHeader
        title="Role-Based Access Control"
        subtitle="Manage custom roles and granular system permissions"
        icon={Shield}
        iconColor="#2563EB"
        accentGradient="from-[#2563EB] to-[#EF5350]"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Roles list */}
        <div className="lg:col-span-1 space-y-4">
          <AnimatedCard className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-md font-bold text-[#0F172A]">Roles list</h3>
              <RippleButton
                variant="primary"
                onClick={handleOpenCreate}
                className="flex items-center gap-1 text-xs py-1 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
              >
                <Plus size={14} /> Add Role
              </RippleButton>
            </div>

            {loadingRoles ? (
              <div className="space-y-2 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-gray-100 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {roles.map((role: any) => (
                  <div
                    key={role.id}
                    onClick={() => setSelectedRoleId(role.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedRoleId === role.id
                        ? 'border-blue-500 bg-blue-50/50 shadow-sm'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-sm text-[#0F172A] flex items-center gap-2">
                        {role.role_name}
                        {role.is_template && (
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                            Default
                          </span>
                        )}
                        {role.franchise_name && !role.is_template && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{role.franchise_name}</span>
                        )}
                        <span className="text-[10px] text-gray-400">{role.user_count || 0} user(s)</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{role.description}</p>
                    </div>

                    {role.editable && !role.is_template && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleOpenEdit(role)}
                          className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteRole(role.id)}
                          className="p-1 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-600"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </AnimatedCard>
        </div>

        {/* Right Column: Permissions Matrix */}
        <div className="lg:col-span-2 space-y-4">
          {selectedRoleId ? (
            <AnimatedCard className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-4 mb-4 gap-2">
                <div>
                  <h3 className="text-md font-bold text-[#0F172A]">
                    Permissions for: <span className="text-blue-600">{selectedRole?.role_name}</span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedRole?.description || 'Assign specific capabilities for this user role.'}
                  </p>
                </div>
                {!selectedRole?.editable ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100">
                    <Info size={14} /> Default role — set by the Super Admin. Create your own role to customise.
                  </div>
                ) : (
                  <RippleButton
                    variant="primary"
                    onClick={handleSavePermissions}
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs py-1.5 px-4"
                    disabled={savePermsMutation.isPending}
                  >
                    {savePermsMutation.isPending ? 'Saving...' : 'Save Permissions'}
                  </RippleButton>
                )}
              </div>

              {loadingPerms ? (
                <div className="space-y-4 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 bg-gray-100 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.keys(groupedPermissions).map((module) => (
                    <div key={module} className="border border-gray-50 rounded-xl p-4 bg-gray-50/20">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                        {groupedPermissions[module][0]?.module_name || module}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {groupedPermissions[module].map((perm: any) => {
                          const isChecked = checkedPerms.includes(perm.id);
                          const isDisabled = !selectedRole?.editable;

                          return (
                            <div
                              key={perm.id}
                              onClick={() => !isDisabled && togglePermission(perm.id)}
                              className={`flex items-start gap-2.5 p-2 rounded-lg transition-colors select-none ${
                                isDisabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:bg-gray-50'
                              }`}
                            >
                              <div className="mt-0.5 text-blue-600">
                                {isChecked ? <CheckSquare size={16} /> : <Square size={16} className="text-gray-300" />}
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-[#0F172A]">
                                  {perm.permission_key}
                                </div>
                                <div className="text-[10px] text-gray-400 mt-0.5">
                                  {perm.description}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AnimatedCard>
          ) : (
            <div className="h-64 flex items-center justify-center border border-dashed border-gray-200 rounded-2xl bg-white text-gray-400 text-sm">
              Select or create a role to configure permissions.
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <AnimatedModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <div className="p-6">
          <h3 className="text-lg font-bold text-[#0F172A] mb-4">
            {editingRole ? 'Edit Role Details' : 'Create Custom Role'}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                Role Name
              </label>
              <input
                type="text"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="e.g. Reception, Shift Supervisor"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                placeholder="Briefly explain responsibilities and access scope..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <RippleButton variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </RippleButton>
            <RippleButton
              variant="primary"
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
              onClick={handleSaveRole}
            >
              Save Changes
            </RippleButton>
          </div>
        </div>
      </AnimatedModal>
    </PageTransition>
  );
}
