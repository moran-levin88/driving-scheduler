import { prisma } from './prisma'

// Single-vehicle school today — same convention as INSTRUCTOR_NAME in
// instructorInfo.ts. find-or-create instead of a one-off seed script, so
// the row exists the first time anyone touches the vehicle log without a
// manual provisioning step.
export const DEFAULT_LICENSE_PLATE = '73630104'

export async function getDefaultVehicle() {
  const existing = await prisma.vehicle.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
  if (existing) return existing
  return prisma.vehicle.create({ data: { licensePlate: DEFAULT_LICENSE_PLATE } })
}
