from rest_framework import serializers
from .models import Employee, Attendance


class EmployeeSerializer(serializers.ModelSerializer):

    class Meta:
        model = Employee
        fields = '__all__'


class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(
        source='employee.name',
        read_only=True
    )
    employee_image = serializers.ImageField(
        source='employee.image',
        read_only=True
    )

    class Meta:
        model = Attendance
        fields = '__all__'